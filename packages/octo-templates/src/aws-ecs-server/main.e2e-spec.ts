import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CloudWatchLogsClient, DescribeLogStreamsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { DisassociateRouteTableCommand, EC2Client } from '@aws-sdk/client-ec2';
import { DescribeServicesCommand, ECSClient } from '@aws-sdk/client-ecs';
import { jest } from '@jest/globals';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { AwsEcsUtility } from '../utilities/aws/ecs/aws-ecs.utility.js';
import { AwsLiveResourcesUtility } from '../utilities/aws/live-resources/aws-live-resources.utility.js';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { OctoCliUtility } from '../utilities/octo/octo-cli.utility.js';
import type { ValidateReport } from '../utilities/octo/validate-report.utility.js';
import { config } from './app.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-ecs-server' };

// Resource ids end in a hash of their scope, which is the same on every run.
const ALB = 'qa-api-alb-015ffb';
const EXECUTION = 'backend-v1-qa-execution-515759';
const PUBLIC_SUBNET = 'app-region-east-public-subnet-c42892';

const SERVICE_ADDRESS = `aws_ecs_service.ecs-service-${EXECUTION}`;
const TASK_DEFINITION_ADDRESS = `aws_ecs_task_definition.ecs-task-definition-${EXECUTION}`;

type ModuleInputs = { [moduleId: string]: any };

/**
 * Every terraform address the execution creates, under the id suffix its scope gives it.
 */
const executionAddresses = (suffix: string): string[] => [
  `aws_cloudwatch_log_group.cloudwatch-log-group-${suffix}`,
  `aws_ecs_service.ecs-service-${suffix}`,
  `aws_ecs_task_definition.ecs-task-definition-${suffix}`,
  `aws_iam_role.iam-role-ExecutionRole-${suffix}`,
  `aws_iam_role_policy_attachment.iam-role-ExecutionRole-${suffix}_AmazonECSTaskExecutionRolePolicy`,
  `aws_security_group.sec-grp-SecurityGroup-${suffix}`,
  `aws_vpc_security_group_egress_rule.sec-grp-SecurityGroup-${suffix}_egress_0`,
  `aws_vpc_security_group_egress_rule.sec-grp-SecurityGroup-${suffix}_egress_1`,
  `aws_vpc_security_group_ingress_rule.sec-grp-SecurityGroup-${suffix}_ingress_0`,
];

jest.setTimeout(3_600_000);

/**
 * The stack is applied once, then each case plans one change against it without applying it. A case
 * asserts every terraform address the plan touches, so a change octo should make in place and plans
 * as a replace, or one that reaches past what it changed, fails here.
 */
describe('Main E2E', () => {
  const environment = { AWS_ACCOUNT_ID: config.AWS_ACCOUNT_ID };

  /**
   * Plans `octo.yaml` with one edit and applies nothing.
   */
  const planChange = async (name: string, edit: (inputs: ModuleInputs) => void): Promise<ValidateReport> => {
    const definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, name, (definition) =>
      edit(Object.fromEntries(definition.modules.map((module) => [module.moduleId, module.moduleInputs]))),
    );
    return OctoCliUtility.validate(__dirname, definitionFilePath, environment);
  };

  /**
   * The report's changes as `<action> <address>`, sorted, after checking it holds nothing else.
   */
  const changesOf = (report: ValidateReport): string[] => {
    expect(report.failures).toEqual([]);
    expect(report.drift).toEqual([]);
    expect(report.uncertain).toEqual([]);
    return report.changes.map((change) => `${change.action} ${change.address}`).sort();
  };

  /**
   * The fields the plan moves on one address.
   */
  const fieldsOf = (report: ValidateReport, address: string): string[] =>
    report.changes.find((change) => change.address === address)?.fields.sort() ?? [];

  it('should serve the echo server through the load balancer', async () => {
    const report = await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', environment);
    expect(report.failures).toEqual([]);

    const { DNSName } = await OctoCliUtility.readCommittedResponse(__dirname, `@octo/alb=alb-${ALB}`);
    const client = axios.create({ baseURL: `http://${DNSName}` });
    // A new target takes a few health checks to turn healthy.
    axiosRetry(client, {
      retries: 18,
      retryCondition: (error) => error.response?.status !== 200,
      retryDelay: () => 10_000,
    });
    expect((await client.get('/')).status).toBe(200);
  });

  it('should write the container logs to the execution log group', async () => {
    const { logStreams = [] } = await new CloudWatchLogsClient({ region: AWS_REGION_ID }).send(
      new DescribeLogStreamsCommand({ logGroupName: '/ecs/backend-v1-qa-execution' }),
    );

    // The awslogs driver names each stream `<prefix>/<container>/<task id>`, the prefix being the container's.
    expect(logStreams.map((stream) => stream.logStreamName)).toContainEqual(
      expect.stringMatching(/^backend-v1\/backend-v1\/[0-9a-f]+$/),
    );
  });

  it('should plan nothing when the applied intent is planned again', async () => {
    const report = await OctoCliUtility.validate(__dirname, 'octo.yaml', environment);

    expect(changesOf(report)).toEqual([]);
    expect(report.confidence).toBe('exact');
  });

  describe('drift', () => {
    it('should report a route table association deleted outside octo', async () => {
      const { subnetAssociationId } = await OctoCliUtility.readCommittedResponse(
        __dirname,
        `@octo/route-table=rt-${PUBLIC_SUBNET}`,
      );
      await new EC2Client({ region: AWS_REGION_ID }).send(
        new DisassociateRouteTableCommand({ AssociationId: subnetAssociationId }),
      );

      const report = await OctoCliUtility.validate(__dirname, 'octo.yaml', environment);

      // Intent did not move, so nothing was mocked, and a drift claim can be believed.
      expect(report.confidence).toBe('exact');
      expect(report.changes).toEqual([]);
      expect(report.drift).toEqual([
        {
          action: 'create',
          address: `aws_route_table_association.rt-${PUBLIC_SUBNET}_assoc`,
          moduleId: 'public-subnet-module',
        },
      ]);
    });

    it('should repair the drift with an apply, and stop reporting it', async () => {
      await OctoCliUtility.lifecycle(__dirname, 'octo.yaml', environment);

      const report = await OctoCliUtility.validate(__dirname, 'octo.yaml', environment);

      expect(changesOf(report)).toEqual([]);
    });
  });

  describe('a change made in place', () => {
    it('should update the service alone when desiredCount changes', async () => {
      const report = await planChange('desired-count', (inputs) => {
        inputs['backend-v1-qa-execution-module'].desiredCount = 2;
      });

      expect(changesOf(report)).toEqual([`update ${SERVICE_ADDRESS}`]);
      expect(fieldsOf(report, SERVICE_ADDRESS)).toEqual(['desired_count']);
    });

    it('should register a new task revision when cpu and memory change', async () => {
      const report = await planChange('cpu-and-memory', (inputs) => {
        inputs['backend-deployment-v1-module'].cpu = 512;
        inputs['backend-deployment-v1-module'].memory = 1024;
      });

      // A task definition revision is immutable, so terraform replaces it and points the service at the new one.
      expect(changesOf(report)).toEqual([`replace ${TASK_DEFINITION_ADDRESS}`, `update ${SERVICE_ADDRESS}`]);
      expect(fieldsOf(report, SERVICE_ADDRESS)).toEqual(['task_definition']);
    });

    it('should register a new task revision when environmentVariables change', async () => {
      const report = await planChange('environment-variables', (inputs) => {
        inputs['qa-environment-module'].environmentVariables = { EXTRA_VAR: 'value', NODE_ENV: 'qa' };
      });

      expect(changesOf(report)).toEqual([`replace ${TASK_DEFINITION_ADDRESS}`, `update ${SERVICE_ADDRESS}`]);
      expect(fieldsOf(report, SERVICE_ADDRESS)).toEqual(['task_definition']);
    });

    it('should register a new task revision when the container is renamed', async () => {
      const report = await planChange('container-name', (inputs) => {
        inputs['backend-v1-qa-execution-module'].deployments.main.containerProperties.image.name = 'backend-v2';
        inputs['qa-api-alb-module'].targets[0].containerName = 'backend-v2';
      });

      expect(changesOf(report)).toEqual([`replace ${TASK_DEFINITION_ADDRESS}`, `update ${SERVICE_ADDRESS}`]);
      expect(fieldsOf(report, SERVICE_ADDRESS)).toEqual(['load_balancer.container_name', 'task_definition']);
    });

    it('should update the rules alone when securityGroupRules change', async () => {
      const report = await planChange('security-group-rules', (inputs) => {
        inputs['backend-v1-qa-execution-module'].securityGroupRules = [
          { CidrBlock: '0.0.0.0/0', Egress: false, FromPort: 80, IpProtocol: 'tcp', ToPort: 80 },
          { CidrBlock: '10.0.0.0/8', Egress: true, FromPort: 8080, IpProtocol: 'tcp', ToPort: 8080 },
        ];
      });

      const group = `sec-grp-SecurityGroup-${EXECUTION}`;
      expect(changesOf(report)).toEqual([
        `delete aws_vpc_security_group_egress_rule.${group}_egress_1`,
        `update aws_vpc_security_group_egress_rule.${group}_egress_0`,
      ]);
    });

    it('should update the target group alone when its health check changes', async () => {
      const report = await planChange('health-check', (inputs) => {
        inputs['qa-api-alb-module'].targets[0].healthCheck.UnhealthyThresholdCount = 3;
      });

      const targetGroup = `aws_lb_target_group.alb-target-group-qa-api-alb-backend-v1-qa-execution-015ffb`;
      expect(changesOf(report)).toEqual([`update ${targetGroup}`]);
      expect(fieldsOf(report, targetGroup)).toEqual(['health_check.unhealthy_threshold']);
    });

    it('should add a listener rule alone when a rule is added', async () => {
      const report = await planChange('listener-rule', (inputs) => {
        const listener = inputs['qa-api-alb-module'].listeners[0];
        listener.rules = [
          {
            actions: listener.DefaultActions,
            conditions: [{ condition: { Values: ['/api'] }, conditionType: 'path-pattern' }],
            Priority: 1,
          },
        ];
      });

      expect(changesOf(report)).toEqual([`create aws_lb_listener_rule.alb-listener-qa-api-alb-80-015ffb_rule_1`]);
    });
  });

  describe('a change that replaces', () => {
    it('should replace only the listener when its port changes', async () => {
      const report = await planChange('listener-port', (inputs) => {
        inputs['qa-api-alb-module'].listeners[0].Port = 443;
      });

      expect(changesOf(report)).toEqual([
        `create aws_lb_listener.alb-listener-qa-api-alb-443-015ffb`,
        `delete aws_lb_listener.alb-listener-qa-api-alb-80-015ffb`,
      ]);
    });

    it('should replace only the subnet and what attaches to it when its CIDR block changes', async () => {
      const report = await planChange('subnet-cidr-block', (inputs) => {
        inputs['public-subnet-module'].subnetCidrBlock = '10.0.3.0/24';
      });

      expect(changesOf(report)).toEqual([
        `replace aws_route_table_association.rt-${PUBLIC_SUBNET}_assoc`,
        `replace aws_subnet.subnet-${PUBLIC_SUBNET}`,
        // The private subnet's ACL admits its siblings by CIDR block.
        `update aws_network_acl.nacl-app-region-east-private-subnet-c42892`,
        `update aws_network_acl.nacl-${PUBLIC_SUBNET}`,
      ]);
    });

    it('should replace the load balancer and its listener when albName changes', async () => {
      const report = await planChange('alb-name', (inputs) => {
        inputs['qa-api-alb-module'].albName = 'changed-qa-api-alb';
      });

      // The target group keeps its name, so only the service is pointed at the new load balancer.
      const group = (name: string): string[] => [
        `aws_security_group.sec-grp-${name}-015ffb`,
        `aws_vpc_security_group_egress_rule.sec-grp-${name}-015ffb_egress_0`,
        `aws_vpc_security_group_ingress_rule.sec-grp-${name}-015ffb_ingress_0`,
      ];
      expect(changesOf(report)).toEqual([
        `create aws_lb.alb-changed-qa-api-alb-015ffb`,
        `create aws_lb_listener.alb-listener-changed-qa-api-alb-80-015ffb`,
        ...group('changed-qa-api-alb').map((address) => `create ${address}`),
        `delete aws_lb.alb-${ALB}`,
        `delete aws_lb_listener.alb-listener-qa-api-alb-80-015ffb`,
        ...group('qa-api-alb').map((address) => `delete ${address}`),
        `update ${SERVICE_ADDRESS}`,
      ]);
    });

    it('should replace everything the execution owns when executionId changes', async () => {
      const report = await planChange('execution-id', (inputs) => {
        inputs['backend-v1-qa-execution-module'].executionId = 'changed-execution-id';
      });

      expect(changesOf(report)).toEqual(
        ['create', 'delete']
          .flatMap((action) =>
            executionAddresses(action === 'create' ? 'changed-execution-id-515759' : EXECUTION).map(
              (address) => `${action} ${address}`,
            ),
          )
          .sort(),
      );
    });
  });

  it('should keep the live service when the deployment above it is renamed', async () => {
    const ecs = new ECSClient({ region: AWS_REGION_ID });
    const serviceArn = async (): Promise<string | undefined> => {
      const { services = [] } = await ecs.send(
        new DescribeServicesCommand({ cluster: 'app-region-east-qa', services: ['backend-v1-qa-execution'] }),
      );
      return services.find((service) => service.status === 'ACTIVE')?.serviceArn;
    };
    const before = await serviceArn();

    const definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, 'deployment-tag', (definition) => {
      definition.modules.find(
        (module) => module.moduleId === 'backend-deployment-v1-module',
      )!.moduleInputs.deploymentTag = 'v2';
    });
    const report = await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    // The deployment is in the scope of everything the execution owns, so each id moves. What AWS
    // names uniquely moves with it; the security group, which AWS names itself, is replaced, and the
    // service is moved onto the new one.
    const renamed = 'backend-v1-qa-execution-2d0ba9';
    const group = (name: string): string[] =>
      executionAddresses(name).filter((address) => address.includes('security_group'));
    expect(changesOf(report)).toEqual(
      [
        ...group(renamed).map((address) => `create ${address}`),
        ...group(EXECUTION).map((address) => `delete ${address}`),
        `update aws_ecs_service.ecs-service-${renamed}`,
      ].sort(),
    );
    expect(before).toBeDefined();
    expect(await serviceArn()).toBe(before);

    // The moves are recorded, so the next plan is clean.
    expect(changesOf(await OctoCliUtility.validate(__dirname, definitionFilePath, environment))).toEqual([]);
  });

  it('should have no resources left after teardown', async () => {
    const definitionFilePath = await OctoCliUtility.writeDefinition(__dirname, 'teardown', (definition) => {
      definition.modules = definition.modules.filter((module) =>
        ['account-module', 'app-module'].includes(module.moduleId),
      );
    });
    await OctoCliUtility.lifecycle(__dirname, definitionFilePath, environment);

    const taggedArns = await new AwsTagsUtility(AWS_REGION_ID).getResourceArnsByTags(E2E_TAGS);

    // Destroying an `aws_ecs_task_definition` only retires the revision to INACTIVE, so reclaim the
    // retired revisions. Cleanup only: the delete is asynchronous and the revisions stay visible to
    // the tagging API well after this returns.
    const taskDefinitionArns = taggedArns.filter((arn) => arn.includes(':task-definition/'));
    if (taskDefinitionArns.length > 0) {
      expect(await new AwsEcsUtility(AWS_REGION_ID).deleteTaskDefinitions(taskDefinitionArns)).toEqual([]);
    }

    // Assert on what is still live: the tagging API keeps returning destroyed ECS clusters, services
    // and task definitions.
    expect(await new AwsLiveResourcesUtility(AWS_REGION_ID).filterLiveArns(taggedArns)).toEqual([]);
  });
});
