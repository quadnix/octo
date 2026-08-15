import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import {
  type Deployment,
  type Execution,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AwsMultiAzRegionId } from '@quadnix/octo-aws-cdk/modules/region/aws-multi-az-region/schema';
import { HtmlReportEventListener } from '@quadnix/octo-event-listeners/html-report';
import { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { AwsEcsUtility } from '../utilities/aws/ecs/aws-ecs.utility.js';
import { AwsLiveResourcesUtility } from '../utilities/aws/live-resources/aws-live-resources.utility.js';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { config } from './app.config.js';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const outputDir = join(__dirname, '.octo', 'generated');

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-ecs-server' };

jest.setTimeout(1_800_000);

describe('Main E2E', () => {
  let moduleDefinitions: ModuleDefinitions;
  let stateProvider: TestStateProvider;
  let testModuleContainer: TestModuleContainer;

  beforeAll(() => {
    stateProvider = new TestStateProvider();
  });

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize(stateProvider, [
      { options: { args: [{ level: 'info' }] }, type: LoggingEventListener },
      { options: { args: [{ reportDir: join(__dirname, '.octo', 'reports') }] }, type: HtmlReportEventListener },
    ]);

    testModuleContainer.registerTerraformConfig({
      minTerraformVersion: '1.6.0',
      providers: { aws: { minVersion: '5.0.0', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', config.AWS_ACCOUNT_ID, AWS_REGION_ID);

    // Register tags on all resources.
    testModuleContainer.registerTags([{ scope: {}, tags: E2E_TAGS }]);

    moduleDefinitions = new ModuleDefinitions();
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  const buildModules = (
    overrides: { [moduleId: string]: (inputs: any) => any } = {},
  ): { inputs: any; moduleId: string; type: any }[] =>
    moduleDefinitions.getAll().map((md) => ({
      inputs: overrides[md.moduleId] ? overrides[md.moduleId](md.moduleInputs) : md.moduleInputs,
      moduleId: md.moduleId,
      type: md.module,
    }));

  const planDigest = async (overrides: { [moduleId: string]: (inputs: any) => any }): Promise<string[]> => {
    const { resourceDiffs, validateReport } = (
      await testModuleContainer.runModules(buildModules(overrides), { outputDir, terraformTarget: 'plan' }).next()
    ).value!;

    // Hinted, because each case snapshots this and its diff digest, and the two are only told apart
    // in the snapshot file by their name.
    expect(validateReport).toMatchSnapshot('validate report');

    return testModuleContainer.digestDiffs(resourceDiffs);
  };

  it('should have server available', async () => {
    const { responses } = (
      await testModuleContainer
        .runModules(
          moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
          { outputDir, terraformTarget: 'apply' },
        )
        .next()
    ).value!;

    const albResponse = Object.entries(responses).find(([context]) => context.startsWith('@octo/alb='))?.[1] as {
      DNSName: string;
    };
    const albDnsName = albResponse.DNSName;

    const axiosClient = axios.create({ baseURL: `http://${albDnsName}` });
    // Retry for 3 minutes to allow the ALB target to become healthy.
    axiosRetry(axiosClient, {
      retries: 18,
      retryCondition: (error) => error.response?.status !== 200,
      retryDelay: () => 10000,
    });
    const albResponse200 = await axiosClient.get(`/`);
    expect(albResponse200.status).toBe(200);
  });

  describe('input changes', () => {
    describe('SimpleAppModule', () => {
      it('should handle name change', async () => {
        expect(await planDigest({ 'app-module': (i) => ({ ...i, name: 'changed-name' }) })).toMatchSnapshot();
      });
    });

    describe('AwsIniAccountModule', () => {
      it('should handle accountId change', async () => {
        // Resources bind to a provider by { accountId, regionId }, so the destination account needs a
        // registered provider before it can be rendered, as a real edit would also have to do. An
        // unused provider is never emitted, so this affects nothing else.
        //
        // Read the snapshot as octo's intent, not as a verified account migration: the accountId
        // reaches terraform only as the provider *alias*, and this provider is registered with no
        // spec, so both aliases resolve to the credentials this suite already runs under. Terraform
        // therefore plans nothing, and the report says exactly that - every resource replaced, no
        // terraform change. A real move needs `assume_role` or `profile` in the provider spec, and a
        // second account to move into.
        testModuleContainer.registerTerraformProvider('aws', 'changed-account-id', AWS_REGION_ID);

        expect(
          await planDigest({ 'account-module': (i) => ({ ...i, accountId: 'changed-account-id' }) }),
        ).toMatchSnapshot();
      });
    });

    describe('AwsMultiAzRegionModule', () => {
      it('should handle name change', async () => {
        expect(await planDigest({ 'region-module': (i) => ({ ...i, name: 'changed-region-name' }) })).toMatchSnapshot();
      });

      it('should handle regionIds change', async () => {
        expect(
          await planDigest({
            'region-module': (i) => ({
              ...i,
              regionIds: [
                AwsMultiAzRegionId.AWS_US_EAST_1A,
                AwsMultiAzRegionId.AWS_US_EAST_1B,
                AwsMultiAzRegionId.AWS_US_EAST_1C,
              ],
            }),
          }),
        ).toMatchSnapshot();
      });

      it('should handle vpcCidrBlock change', async () => {
        // A VPC CIDR change is inherently coordinated: moving the VPC alone leaves the subnets outside
        // it, which `AwsSimpleSubnetModule` refuses, and a VPC CIDR may not be wider than /16, so no
        // other /16 contains the current `10.0.x.0/24` subnets. They move together.
        expect(
          await planDigest({
            'private-subnet-module': (i) => ({ ...i, subnetCidrBlock: '10.1.2.0/24' }),
            'public-backup-subnet-module': (i) => ({ ...i, subnetCidrBlock: '10.1.1.0/24' }),
            'public-subnet-module': (i) => ({ ...i, subnetCidrBlock: '10.1.0.0/24' }),
            'region-module': (i) => ({ ...i, vpcCidrBlock: '10.1.0.0/16' }),
          }),
        ).toMatchSnapshot();
      });
    });

    describe('AwsEcsServerModule', () => {
      it('should handle serverKey change', async () => {
        expect(
          await planDigest({ 'backend-server-module': (i) => ({ ...i, serverKey: 'changed-backend' }) }),
        ).toMatchSnapshot();
      });
    });

    describe('AwsEcsDeploymentModule', () => {
      it('should handle deploymentContainerProperties change', async () => {
        expect(
          await planDigest({
            'backend-deployment-v1-module': (i) => ({
              ...i,
              deploymentContainerProperties: {
                cpu: 512,
                image: {
                  command: 'node webserver',
                  ports: [{ containerPort: 80, protocol: 'tcp' }],
                  uri: 'docker.io/ealen/echo-server:0.9.2',
                },
                memory: 1024,
              },
            }),
          }),
        ).toMatchSnapshot();
      });

      it('should handle deploymentTag change', async () => {
        expect(
          await planDigest({ 'backend-deployment-v1-module': (i) => ({ ...i, deploymentTag: 'v2' }) }),
        ).toMatchSnapshot();
      });
    });

    describe('AwsEcsEnvironmentModule', () => {
      it('should handle environmentName change', async () => {
        expect(
          await planDigest({ 'qa-environment-module': (i) => ({ ...i, environmentName: 'changed-qa' }) }),
        ).toMatchSnapshot();
      });

      it('should handle environmentVariables change', async () => {
        expect(
          await planDigest({
            'qa-environment-module': (i) => ({ ...i, environmentVariables: { EXTRA_VAR: 'value', NODE_ENV: 'qa' } }),
          }),
        ).toMatchSnapshot();
      });
    });

    describe('AwsSimpleSubnetModule', () => {
      it('should handle subnetAvailabilityZone change on public-subnet-module', async () => {
        expect(
          await planDigest({ 'public-subnet-module': (i) => ({ ...i, subnetAvailabilityZone: 'us-east-1b' }) }),
        ).toMatchSnapshot();
      });

      it('should handle subnetCidrBlock change on public-subnet-module', async () => {
        expect(
          await planDigest({ 'public-subnet-module': (i) => ({ ...i, subnetCidrBlock: '10.0.3.0/24' }) }),
        ).toMatchSnapshot();
      });

      it('should handle subnetName change on public-subnet-module', async () => {
        expect(
          await planDigest({ 'public-subnet-module': (i) => ({ ...i, subnetName: 'changed-public-subnet' }) }),
        ).toMatchSnapshot();
      });

      it('should handle subnetOptions change on public-subnet-module', async () => {
        expect(
          await planDigest({
            'public-subnet-module': (i) => ({
              ...i,
              subnetOptions: {
                createNatGateway: true,
                disableSubnetIntraNetwork: true,
                subnetType: SubnetType.PUBLIC,
              },
            }),
          }),
        ).toMatchSnapshot();
      });
    });

    describe('AwsEcsExecutionModule', () => {
      it('should handle deployments change', async () => {
        expect(
          await planDigest({
            'backend-v1-qa-execution-module': (i) => ({
              ...i,
              deployments: {
                main: {
                  containerProperties: {
                    image: {
                      essential: true,
                      name: 'backend-v2',
                    },
                  },
                  deployment: stub<Deployment>('${{backend-deployment-v1-module.model.deployment}}'),
                },
                sidecars: [],
              },
            }),
            'qa-api-alb-module': (i) => ({
              ...i,
              targets: [
                {
                  containerName: 'backend-v2',
                  containerPort: 80,
                  execution: stub<Execution>('${{backend-v1-qa-execution-module.model.execution}}'),
                  healthCheck: {
                    HealthCheckIntervalSeconds: 30,
                    HealthCheckPath: '/',
                    HealthCheckPort: 80,
                    HealthCheckProtocol: 'HTTP',
                    HealthCheckTimeoutSeconds: 5,
                    HealthyThresholdCount: 2,
                    Matcher: { HttpCode: 200 },
                    UnhealthyThresholdCount: 2,
                  },
                  Name: 'backend-v1-80',
                },
              ],
            }),
          }),
        ).toMatchSnapshot();
      });

      it('should handle desiredCount change', async () => {
        // Against an applied baseline this is the one resource that renders `desired_count`. A
        // snapshot showing the entire stack as an add means it was captured with an empty resource
        // state, i.e. on a run where the apply test above never completed - re-record it.
        expect(
          await planDigest({ 'backend-v1-qa-execution-module': (i) => ({ ...i, desiredCount: 2 }) }),
        ).toMatchSnapshot();
      });

      it('should handle executionId change', async () => {
        expect(
          await planDigest({
            'backend-v1-qa-execution-module': (i) => ({ ...i, executionId: 'changed-execution-id' }),
          }),
        ).toMatchSnapshot();
      });

      it('should handle securityGroupRules change', async () => {
        expect(
          await planDigest({
            'backend-v1-qa-execution-module': (i) => ({
              ...i,
              securityGroupRules: [
                {
                  CidrBlock: '0.0.0.0/0',
                  Egress: false,
                  FromPort: 80,
                  IpProtocol: 'tcp',
                  ToPort: 80,
                },
                {
                  CidrBlock: '10.0.0.0/8',
                  Egress: true,
                  FromPort: 8080,
                  IpProtocol: 'tcp',
                  ToPort: 8080,
                },
              ],
            }),
          }),
        ).toMatchSnapshot();
      });
    });

    describe('AwsEcsAlbServiceModule', () => {
      it('should handle albName change', async () => {
        expect(
          await planDigest({ 'qa-api-alb-module': (i) => ({ ...i, albName: 'changed-qa-api-alb' }) }),
        ).toMatchSnapshot();
      });

      it('should handle listeners Port change', async () => {
        expect(
          await planDigest({
            'qa-api-alb-module': (i) => ({
              ...i,
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: { TargetGroups: [{ targetGroupName: 'backend-v1-80', Weight: 100 }] },
                      actionType: 'forward',
                    },
                  ],

                  Port: 443,
                  rules: [],
                },
              ],
            }),
          }),
        ).toMatchSnapshot();
      });

      it('should handle listeners rules change', async () => {
        expect(
          await planDigest({
            'qa-api-alb-module': (i) => ({
              ...i,
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: { TargetGroups: [{ targetGroupName: 'backend-v1-80', Weight: 100 }] },
                      actionType: 'forward',
                    },
                  ],

                  Port: 80,
                  rules: [
                    {
                      actions: [
                        {
                          action: { TargetGroups: [{ targetGroupName: 'backend-v1-80', Weight: 100 }] },
                          actionType: 'forward',
                        },
                      ],

                      conditions: [{ condition: { Values: ['/api'] }, conditionType: 'path-pattern' }],
                      Priority: 1,
                    },
                  ],
                },
              ],
            }),
          }),
        ).toMatchSnapshot();
      });

      it('should handle targets healthCheck change', async () => {
        expect(
          await planDigest({
            'qa-api-alb-module': (i) => ({
              ...i,
              targets: [
                {
                  containerName: 'backend-v1',
                  containerPort: 80,
                  execution: stub<Execution>('${{backend-v1-qa-execution-module.model.execution}}'),
                  healthCheck: {
                    HealthCheckIntervalSeconds: 30,
                    HealthCheckPath: '/',
                    HealthCheckPort: 80,
                    HealthCheckProtocol: 'HTTP',
                    HealthCheckTimeoutSeconds: 5,
                    HealthyThresholdCount: 2,
                    Matcher: { HttpCode: 200 },
                    UnhealthyThresholdCount: 3,
                  },
                  Name: 'backend-v1-80',
                },
              ],
            }),
          }),
        ).toMatchSnapshot();
      });
    });
  });

  it('should have no resources left after teardown', async () => {
    for (const moduleId of moduleDefinitions
      .getAll()
      .map((md) => md.moduleId)
      .filter((moduleId) => moduleId !== 'app-module' && moduleId !== 'account-module')) {
      moduleDefinitions.remove(moduleId);
    }

    await testModuleContainer
      .runModules(
        moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
        { outputDir, terraformTarget: 'apply' },
      )
      .next();

    const awsResourcesUtility = new AwsTagsUtility(AWS_REGION_ID);

    const taggedArns = await awsResourcesUtility.getResourceArnsByTags(E2E_TAGS);

    // Destroying an `aws_ecs_task_definition` only retires the revision to INACTIVE, so reclaim the
    // retired revisions. Cleanup only: the delete is asynchronous and the revisions stay visible to
    // the tagging API well after this returns.
    const taskDefinitionArns = taggedArns.filter((arn) => arn.includes(':task-definition/'));
    if (taskDefinitionArns.length > 0) {
      const failures = await new AwsEcsUtility(AWS_REGION_ID).deleteTaskDefinitions(taskDefinitionArns);
      expect(failures).toEqual([]);
    }

    // Assert on what is still live: the tagging API keeps returning destroyed ECS clusters, services
    // and task definitions, and deleted NAT gateways.
    const liveArns = await new AwsLiveResourcesUtility(AWS_REGION_ID).filterLiveArns(taggedArns);
    expect(liveArns).toEqual([]);
  });
});
