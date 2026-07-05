import {
  type AResource,
  type Account,
  type App,
  MatchingResource,
  type Region,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsEcsServiceAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-service.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { EcsClusterSchema } from '../../../resources/ecs-cluster/index.schema.js';
import { EcsService } from '../../../resources/ecs-service/index.js';
import type { EcsTaskDefinitionSchema } from '../../../resources/ecs-task-definition/index.schema.js';
import type { InternetGatewaySchema } from '../../../resources/internet-gateway/index.schema.js';
import type { SubnetSchema } from '../../../resources/subnet/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { AwsEcsAlbServiceModule } from './index.js';

const HEALTH_CHECK_RESPONSE = {
  HealthCheckIntervalSeconds: 30,
  HealthCheckPath: '/health',
  HealthCheckPort: 80,
  HealthCheckProtocol: 'HTTP' as const,
  HealthCheckTimeoutSeconds: 5,
  HealthyThresholdCount: 3,
  Matcher: { HttpCode: 200 },
  UnhealthyThresholdCount: 3,
};

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    deployment: [deployment],
    environment: [environment],
    region: [region],
    server: [server],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    deployment: ['v1'],
    environment: ['qa'],
    region: ['region'],
    server: ['backend'],
  });

  const {
    subnet: [subnet1],
  } = await testModuleContainer.createTestModels('testSubnet1Module', {
    account: [account],
    app: [app],
    region: [region],
    subnet: ['public-subnet-1'],
  });
  subnet1.subnetType = SubnetType.PUBLIC;
  const {
    subnet: [subnet2],
  } = await testModuleContainer.createTestModels('testSubnet2Module', {
    account: [account],
    app: [app],
    region: [region],
    subnet: ['public-subnet-2'],
  });
  subnet2.subnetType = SubnetType.PUBLIC;

  const {
    execution: [execution],
  } = await testModuleContainer.createTestModels('testExecutionModule', {
    account: [account],
    app: [app],
    deployment: [deployment],
    environment: [environment],
    execution: [':0:0:0'],
    region: [region],
    server: [server],
    subnet: [subnet1],
  });

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  const testOverlays = await testModuleContainer.createTestOverlays('testExecutionModule', [
    {
      anchors: [],
      context: `@octo/aws-ecs-execution-overlay=aws-ecs-execution-overlay-${execution.executionId}`,
      properties: {
        executionId: execution.executionId,
      },
    },
  ]);
  const executionOverlay =
    testOverlays[`@octo/aws-ecs-execution-overlay=aws-ecs-execution-overlay-${execution.executionId}`];
  execution.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcsServiceAnchorSchema>(
      'AwsEcsServiceAnchorSchema',
      {
        executionId: execution.executionId,
      },
      executionOverlay,
    ),
  );

  const { '@octo/ecs-cluster=ecs-cluster-region-qa': ecsClusterResource } =
    await testModuleContainer.createTestResources<[EcsClusterSchema, InternetGatewaySchema, VpcSchema]>(
      'testModule',
      [
        {
          properties: {
            awsAccountId: '123',
            awsRegionId: 'us-east-1',
            clusterName: 'region-qa',
          },
          resourceContext: '@octo/ecs-cluster=ecs-cluster-region-qa',
          response: {
            clusterArn: 'clusterArn',
          },
          terraform: true,
        },
        {
          properties: {
            awsAccountId: '123',
            awsRegionId: 'us-east-1',
            internetGatewayName: 'default',
          },
          resourceContext: '@octo/internet-gateway=igw-region',
          response: { InternetGatewayId: 'InternetGatewayId' },
          terraform: true,
        },
        {
          properties: {
            awsAccountId: '123',
            awsAvailabilityZones: ['us-east-1a'],
            awsRegionId: 'us-east-1',
            CidrBlock: '10.0.0.0/16',
            InstanceTenancy: 'default',
          },
          resourceContext: '@octo/vpc=vpc-region',
          response: { VpcId: 'VpcId' },
          terraform: true,
        },
      ],
      { save: true },
    );
  const { '@octo/subnet=subnet-region-public-subnet-1': subnet1Resource } =
    await testModuleContainer.createTestResources<[SubnetSchema]>(
      'testSubnet1Module',
      [
        {
          properties: {
            AvailabilityZone: 'us-east-1a',
            awsAccountId: '123',
            awsRegionId: 'us-east-1',
            CidrBlock: '10.0.0.0/24',
            subnetName: 'public-subnet-1',
          },
          resourceContext: '@octo/subnet=subnet-region-public-subnet-1',
          response: { SubnetArn: 'SubnetArn', SubnetId: 'SubnetId' },
          terraform: true,
        },
      ],
      { save: true },
    );
  await testModuleContainer.createTestResources<[SubnetSchema]>(
    'testSubnet2Module',
    [
      {
        properties: {
          AvailabilityZone: 'us-east-1a',
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          CidrBlock: '10.1.0.0/24',
          subnetName: 'public-subnet-2',
        },
        resourceContext: '@octo/subnet=subnet-region-public-subnet-2',
        response: { SubnetArn: 'SubnetArn', SubnetId: 'SubnetId' },
        terraform: true,
      },
    ],
    { save: true },
  );
  const {
    '@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-public-subnet-1': ecsTaskDefinitionResource,
  } = await testModuleContainer.createTestResources<[EcsTaskDefinitionSchema]>(
    'testExecutionModule',
    [
      {
        properties: {
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          cpu: 256,
          deploymentTag: 'v1',
          environmentVariables: [],
          family: 'backend',
          images: [
            {
              command: [],
              essential: true,
              name: 'test-container',
              ports: [
                { containerPort: 80, protocol: 'tcp' },
                { containerPort: 8080, protocol: 'tcp' },
              ],
              uri: '',
            },
            {
              command: [],
              essential: true,
              name: 'side-container',
              ports: [{ containerPort: 80, protocol: 'tcp' }],
              uri: '',
            },
          ],
          memory: 512,
        },
        resourceContext: '@octo/ecs-task-definition=ecs-task-definition-backend-v1-region-qa-public-subnet-1',
        response: {
          revision: '1',
          taskDefinitionArn: 'taskDefinitionArn',
        },
        terraform: true,
      },
    ],
    { save: true },
  );

  const ecsCluster = ecsClusterResource as AResource<EcsClusterSchema, any>;
  const ecsTaskDefinition = ecsTaskDefinitionResource as AResource<EcsTaskDefinitionSchema, any>;
  const publicSubnet = subnet1Resource as AResource<SubnetSchema, any>;

  const ecsService = new EcsService(
    'ecs-service-backend-v1-region-qa-public-subnet-1',
    {
      assignPublicIp: 'ENABLED',
      awsAccountId: '123',
      awsRegionId: 'us-east-1',
      desiredCount: 1,
      loadBalancers: [],
      serviceName: 'backend',
    },
    [new MatchingResource(ecsCluster), new MatchingResource(ecsTaskDefinition), new MatchingResource(publicSubnet)],
  );
  await testModuleContainer.createResources('testExecutionModule', [ecsService], { save: true });

  return { account, app, region };
}

describe('AwsEcsAlbServiceModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<AwsEcsAlbServiceModule>(
      app,
      {
        inputs: {
          albName: 'test-alb',
          listeners: [
            {
              DefaultActions: [
                {
                  action: {
                    TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                  },
                  actionType: 'forward',
                },
              ],
              Port: 80,
              rules: [
                {
                  actions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  conditions: [
                    {
                      condition: { Values: ['/api'] },
                      conditionType: 'path-pattern',
                    },
                  ],
                  Priority: 1,
                },
              ],
            },
          ],
          region: stub('${{testModule.model.region}}'),
          subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
          targets: [
            {
              containerName: 'test-container',
              containerPort: 80,
              execution: stub('${{testExecutionModule.model.execution}}'),
              healthCheck: HEALTH_CHECK_RESPONSE,
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      },
      { filterByModuleIds: ['alb-module'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclRender).toMatchInlineSnapshot(`
     "# alb-module/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
     }

     resource "aws_security_group" "sec-grp-region-test-alb" {
       provider = aws._123-us-east-1
       vpc_id = var.vpc_region_VpcId
     }

     resource "aws_vpc_security_group_ingress_rule" "sec-grp-region-test-alb_ingress_0" {
       provider = aws._123-us-east-1
       cidr_ipv4 = "0.0.0.0/0"
       description = "tcp 80-80 0.0.0.0/0"
       ip_protocol = "tcp"
       security_group_id = aws_security_group.sec-grp-region-test-alb.id
       from_port = 80
       to_port = 80

       depends_on = [aws_security_group.sec-grp-region-test-alb]
     }

     resource "aws_vpc_security_group_egress_rule" "sec-grp-region-test-alb_egress_0" {
       provider = aws._123-us-east-1
       cidr_ipv4 = "0.0.0.0/0"
       description = "tcp 0-65535 0.0.0.0/0"
       ip_protocol = "tcp"
       security_group_id = aws_security_group.sec-grp-region-test-alb.id
       from_port = 0
       to_port = 65535

       depends_on = [aws_vpc_security_group_ingress_rule.sec-grp-region-test-alb_ingress_0]
     }

     resource "aws_lb" "alb-region-test-alb" {
       provider = aws._123-us-east-1
       internal = false
       ip_address_type = "ipv4"
       load_balancer_type = "application"
       name = "test-alb"
       security_groups = [aws_security_group.sec-grp-region-test-alb.id]
       subnets = [var.subnet_region_public_subnet_1_SubnetId, var.subnet_region_public_subnet_2_SubnetId]
     }

     resource "aws_lb_target_group" "alb-target-group-backend-v1-region-qa-public-subnet-1" {
       provider = aws._123-us-east-1
       ip_address_type = "ipv4"
       name = "test-container-80"
       port = 80
       protocol = "HTTP"
       protocol_version = "HTTP1"
       target_type = "ip"
       vpc_id = var.vpc_region_VpcId
       health_check {
         enabled = true
         healthy_threshold = 3
         interval = 30
         matcher = "200"
         path = "/health"
         port = "80"
         protocol = "HTTP"
         timeout = 5
         unhealthy_threshold = 3
       }
     }

     resource "aws_lb_listener" "alb-listener-test-alb" {
       provider = aws._123-us-east-1
       default_action {
         forward {
           target_group {
             arn = aws_lb_target_group.alb-target-group-backend-v1-region-qa-public-subnet-1.arn
             weight = 100
           }
         }
         type = "forward"
       }
       load_balancer_arn = aws_lb.alb-region-test-alb.arn
       port = 80
       protocol = "HTTP"
     }

     resource "aws_lb_listener_rule" "alb-listener-test-alb_rule_1" {
       provider = aws._123-us-east-1
       action {
         forward {
           target_group {
             arn = aws_lb_target_group.alb-target-group-backend-v1-region-qa-public-subnet-1.arn
             weight = 100
           }
         }
         type = "forward"
       }
       condition {
         path_pattern {
           values = ["/api"]
         }
       }
       listener_arn = aws_lb_listener.alb-listener-test-alb.arn
       priority = 1

       depends_on = [aws_lb_listener.alb-listener-test-alb]
     }

     # alb-module/outputs.tf
     output "sec-grp-region-test-alb-Arn" {
       value = aws_security_group.sec-grp-region-test-alb.arn
     }

     output "sec-grp-region-test-alb-GroupId" {
       value = aws_security_group.sec-grp-region-test-alb.id
     }

     output "alb-region-test-alb-DNSName" {
       value = aws_lb.alb-region-test-alb.dns_name
     }

     output "alb-region-test-alb-LoadBalancerArn" {
       value = aws_lb.alb-region-test-alb.arn
     }

     output "alb-target-group-backend-v1-region-qa-public-subnet-1-TargetGroupArn" {
       value = aws_lb_target_group.alb-target-group-backend-v1-region-qa-public-subnet-1.arn
     }

     output "alb-listener-test-alb-ListenerArn" {
       value = aws_lb_listener.alb-listener-test-alb.arn
     }

     # alb-module/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     dependency "testModule" {
       config_path = "../testModule"

       mock_outputs = {
         "vpc-region-VpcId" = "mock-vpc-region-VpcId"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
     }

     dependency "testSubnet1Module" {
       config_path = "../testSubnet1Module"

       mock_outputs = {
         "subnet-region-public-subnet-1-SubnetId" = "mock-subnet-region-public-subnet-1-SubnetId"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
     }

     dependency "testSubnet2Module" {
       config_path = "../testSubnet2Module"

       mock_outputs = {
         "subnet-region-public-subnet-2-SubnetId" = "mock-subnet-region-public-subnet-2-SubnetId"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
     }

     inputs = {
       subnet_region_public_subnet_1_SubnetId = dependency.testSubnet1Module.outputs["subnet-region-public-subnet-1-SubnetId"]
       subnet_region_public_subnet_2_SubnetId = dependency.testSubnet2Module.outputs["subnet-region-public-subnet-2-SubnetId"]
       vpc_region_VpcId = dependency.testModule.outputs["vpc-region-VpcId"]
     }

     # alb-module/variables.tf
     variable "subnet_region_public_subnet_1_SubnetId" {}

     variable "subnet_region_public_subnet_2_SubnetId" {}

     variable "vpc_region_VpcId" {}

     # testExecutionModule/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
     }

     resource "aws_ecs_service" "ecs-service-backend-v1-region-qa-public-subnet-1" {
       provider = aws._123-us-east-1
       cluster = var.ecs_cluster_region_qa_clusterArn
       desired_count = 1
       launch_type = "FARGATE"
       name = "backend"
       network_configuration {
         assign_public_ip = true
         subnets = [var.subnet_region_public_subnet_1_SubnetId]
       }
       task_definition = "taskDefinitionArn"
       load_balancer {
         container_name = "test-container"
         container_port = 80
         target_group_arn = var.alb_target_group_backend_v1_region_qa_public_subnet_1_TargetGroupArn
       }
     }

     # testExecutionModule/outputs.tf
     output "ecs-task-definition-backend-v1-region-qa-public-subnet-1-revision" {
       value = "1"
     }

     output "ecs-task-definition-backend-v1-region-qa-public-subnet-1-taskDefinitionArn" {
       value = "taskDefinitionArn"
     }

     output "ecs-service-backend-v1-region-qa-public-subnet-1-serviceArn" {
       value = aws_ecs_service.ecs-service-backend-v1-region-qa-public-subnet-1.id
     }

     # testExecutionModule/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     dependency "alb-module" {
       config_path = "../alb-module"

       mock_outputs = {
         "alb-target-group-backend-v1-region-qa-public-subnet-1-TargetGroupArn" = "arn:aws:elasticloadbalancing:us-east-1:000000000000:targetgroup/mock-tg/0123456789abcdef"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
     }

     dependency "testModule" {
       config_path = "../testModule"

       mock_outputs = {
         "ecs-cluster-region-qa-clusterArn" = "mock-ecs-cluster-region-qa-clusterArn"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
     }

     dependency "testSubnet1Module" {
       config_path = "../testSubnet1Module"

       mock_outputs = {
         "subnet-region-public-subnet-1-SubnetId" = "mock-subnet-region-public-subnet-1-SubnetId"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
     }

     inputs = {
       alb_target_group_backend_v1_region_qa_public_subnet_1_TargetGroupArn = dependency.alb-module.outputs["alb-target-group-backend-v1-region-qa-public-subnet-1-TargetGroupArn"]
       ecs_cluster_region_qa_clusterArn = dependency.testModule.outputs["ecs-cluster-region-qa-clusterArn"]
       subnet_region_public_subnet_1_SubnetId = dependency.testSubnet1Module.outputs["subnet-region-public-subnet-1-SubnetId"]
     }

     # testExecutionModule/variables.tf
     variable "alb_target_group_backend_v1_region_qa_public_subnet_1_TargetGroupArn" {}

     variable "ecs_cluster_region_qa_clusterArn" {}

     variable "subnet_region_public_subnet_1_SubnetId" {}

     # testModule/main.tf
     terraform {
       required_version = ">= 1.6.0"
     }

     # testModule/outputs.tf
     output "ecs-cluster-region-qa-clusterArn" {
       value = "clusterArn"
     }

     output "igw-region-InternetGatewayId" {
       value = "InternetGatewayId"
     }

     output "vpc-region-VpcId" {
       value = "VpcId"
     }

     # testModule/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     # testModule/variables.tf
     <empty>

     # testSubnet1Module/main.tf
     terraform {
       required_version = ">= 1.6.0"
     }

     # testSubnet1Module/outputs.tf
     output "subnet-region-public-subnet-1-SubnetArn" {
       value = "SubnetArn"
     }

     output "subnet-region-public-subnet-1-SubnetId" {
       value = "SubnetId"
     }

     # testSubnet1Module/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     # testSubnet1Module/variables.tf
     <empty>

     # testSubnet2Module/main.tf
     terraform {
       required_version = ">= 1.6.0"
     }

     # testSubnet2Module/outputs.tf
     output "subnet-region-public-subnet-2-SubnetArn" {
       value = "SubnetArn"
     }

     output "subnet-region-public-subnet-2-SubnetId" {
       value = "SubnetId"
     }

     # testSubnet2Module/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     # testSubnet2Module/variables.tf
     <empty>"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcsAlbServiceModelAction",
       ],
       [
         "AddAwsEcsAlbServiceOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-region-test-alb",
       "+ @octo/alb=alb-region-test-alb",
       "+ @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "+ @octo/alb-listener=alb-listener-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-region-test-alb",
       "+ @octo/alb=alb-region-test-alb",
       "+ @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "+ @octo/alb-listener=alb-listener-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
     ]
    `);

    const { app: appAddListenerRule } = await setup(testModuleContainer);
    const addListenerRule = (
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appAddListenerRule,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [
                    {
                      actions: [
                        {
                          action: { ContentType: 'text/plain', MessageBody: 'Not implemented!', StatusCode: 404 },
                          actionType: 'fixed-response',
                        },
                      ],
                      conditions: [{ condition: { Values: ['/api'] }, conditionType: 'path-pattern' }],
                      Priority: 1,
                    },
                  ],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(addListenerRule.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(addListenerRule.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/alb-listener=alb-listener-test-alb",
     ]
    `);

    const { app: appUpdateListenerRule } = await setup(testModuleContainer);
    const updateListenerRule = (
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appUpdateListenerRule,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [
                    {
                      actions: [
                        {
                          action: { TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }] },
                          actionType: 'forward',
                        },
                      ],
                      conditions: [{ condition: { Values: ['/api'] }, conditionType: 'path-pattern' }],
                      Priority: 2,
                    },
                  ],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateListenerRule.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateListenerRule.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/alb-listener=alb-listener-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const deleteResult = (
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appDelete,
          {
            hidden: true,
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteResult.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteResult.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "- @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "- @octo/security-group=sec-grp-region-test-alb",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       "- @octo/alb=alb-region-test-alb",
       "- @octo/alb-listener=alb-listener-test-alb",
     ]
    `);

    expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-region-test-alb",
       "+ @octo/alb=alb-region-test-alb",
       "+ @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "+ @octo/alb-listener=alb-listener-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appUpdateTags,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "* @octo/security-group=sec-grp-region-test-alb",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       "* @octo/alb=alb-region-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appDeleteTags,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "* @octo/security-group=sec-grp-region-test-alb",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       "* @octo/alb=alb-region-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle albName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateAlbName } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsAlbServiceModule>(
            appUpdateAlbName,
            {
              inputs: {
                albName: 'changed-alb',
                listeners: [
                  {
                    DefaultActions: [
                      {
                        action: {
                          TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                        },
                        actionType: 'forward',
                      },
                    ],
                    Port: 80,
                    rules: [],
                  },
                ],
                region: stub('${{testModule.model.region}}'),
                subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
                targets: [
                  {
                    containerName: 'test-container',
                    containerPort: 80,
                    execution: stub('${{testExecutionModule.model.execution}}'),
                    healthCheck: HEALTH_CHECK_RESPONSE,
                    Name: 'test-container-80',
                  },
                ],
              },
              moduleId: 'alb-module',
              type: AwsEcsAlbServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/security-group=sec-grp-region-test-alb",
         "- @octo/alb=alb-region-test-alb",
         "- @octo/alb-listener=alb-listener-test-alb",
         "+ @octo/security-group=sec-grp-region-changed-alb",
         "+ @octo/alb=alb-region-changed-alb",
         "+ @octo/alb-listener=alb-listener-changed-alb",
         "* @octo/alb-listener=alb-listener-changed-alb",
       ]
      `);
    });

    it('should handle listener DefaultActions change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateListenerDefaultAction } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsAlbServiceModule>(
            appUpdateListenerDefaultAction,
            {
              inputs: {
                albName: 'test-alb',
                listeners: [
                  {
                    DefaultActions: [
                      {
                        action: { ContentType: 'text/plain', MessageBody: 'Not Found!', StatusCode: 404 },
                        actionType: 'fixed-response',
                      },
                    ],
                    Port: 80,
                    rules: [],
                  },
                ],
                region: stub('${{testModule.model.region}}'),
                subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
                targets: [],
              },
              moduleId: 'alb-module',
              type: AwsEcsAlbServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
         "* @octo/alb-listener=alb-listener-test-alb",
       ]
      `);
    });

    it('should handle listener Port change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateListenerPort } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsAlbServiceModule>(
            appUpdateListenerPort,
            {
              inputs: {
                albName: 'test-alb',
                listeners: [
                  {
                    DefaultActions: [
                      {
                        action: {
                          TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                        },
                        actionType: 'forward',
                      },
                    ],
                    Port: 8080,
                    rules: [],
                  },
                ],
                region: stub('${{testModule.model.region}}'),
                subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
                targets: [
                  {
                    containerName: 'test-container',
                    containerPort: 80,
                    execution: stub('${{testExecutionModule.model.execution}}'),
                    healthCheck: HEALTH_CHECK_RESPONSE,
                    Name: 'test-container-80',
                  },
                ],
              },
              moduleId: 'alb-module',
              type: AwsEcsAlbServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/alb-listener=alb-listener-test-alb",
       ]
      `);
    });

    it('should handle listener rules change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateListenerRule } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsAlbServiceModule>(
            appUpdateListenerRule,
            {
              inputs: {
                albName: 'test-alb',
                listeners: [
                  {
                    DefaultActions: [
                      {
                        action: {
                          TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                        },
                        actionType: 'forward',
                      },
                    ],
                    Port: 80,
                    rules: [
                      {
                        actions: [
                          {
                            action: { ContentType: 'text/plain', MessageBody: 'Not implemented!', StatusCode: 404 },
                            actionType: 'fixed-response',
                          },
                        ],
                        conditions: [{ condition: { Values: ['/api'] }, conditionType: 'path-pattern' }],
                        Priority: 1,
                      },
                    ],
                  },
                ],
                region: stub('${{testModule.model.region}}'),
                subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
                targets: [
                  {
                    containerName: 'test-container',
                    containerPort: 80,
                    execution: stub('${{testExecutionModule.model.execution}}'),
                    healthCheck: HEALTH_CHECK_RESPONSE,
                    Name: 'test-container-80',
                  },
                ],
              },
              moduleId: 'alb-module',
              type: AwsEcsAlbServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/alb-listener=alb-listener-test-alb",
       ]
      `);
    });

    it('should handle target add change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: { ContentType: 'text/plain', MessageBody: 'Not Found!', StatusCode: 404 },
                      actionType: 'fixed-response',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateTargetAddNewTarget } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsAlbServiceModule>(
            appUpdateTargetAddNewTarget,
            {
              inputs: {
                albName: 'test-alb',
                listeners: [
                  {
                    DefaultActions: [
                      {
                        action: {
                          TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                        },
                        actionType: 'forward',
                      },
                    ],
                    Port: 80,
                    rules: [],
                  },
                ],
                region: stub('${{testModule.model.region}}'),
                subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
                targets: [
                  {
                    containerName: 'test-container',
                    containerPort: 80,
                    execution: stub('${{testExecutionModule.model.execution}}'),
                    healthCheck: HEALTH_CHECK_RESPONSE,
                    Name: 'test-container-80',
                  },
                ],
              },
              moduleId: 'alb-module',
              type: AwsEcsAlbServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
         "* @octo/alb-listener=alb-listener-test-alb",
         "+ @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       ]
      `);
    });

    it('should handle target containerName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateTargetContainerName } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsAlbServiceModule>(
            appUpdateTargetContainerName,
            {
              inputs: {
                albName: 'test-alb',
                listeners: [
                  {
                    DefaultActions: [
                      {
                        action: {
                          TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                        },
                        actionType: 'forward',
                      },
                    ],
                    Port: 80,
                    rules: [],
                  },
                ],
                region: stub('${{testModule.model.region}}'),
                subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
                targets: [
                  {
                    containerName: 'side-container',
                    containerPort: 80,
                    execution: stub('${{testExecutionModule.model.execution}}'),
                    healthCheck: HEALTH_CHECK_RESPONSE,
                    Name: 'test-container-80',
                  },
                ],
              },
              moduleId: 'alb-module',
              type: AwsEcsAlbServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       ]
      `);
    });

    it('should handle target containerPort change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateTargetContainerPort } = await setup(testModuleContainer);
      // The target group port is force-new on aws_lb_target_group → octo emits a REPLACE.
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsAlbServiceModule>(
            appUpdateTargetContainerPort,
            {
              inputs: {
                albName: 'test-alb',
                listeners: [
                  {
                    DefaultActions: [
                      {
                        action: {
                          TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                        },
                        actionType: 'forward',
                      },
                    ],
                    Port: 80,
                    rules: [],
                  },
                ],
                region: stub('${{testModule.model.region}}'),
                subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
                targets: [
                  {
                    containerName: 'test-container',
                    containerPort: 8080,
                    execution: stub('${{testExecutionModule.model.execution}}'),
                    healthCheck: HEALTH_CHECK_RESPONSE,
                    Name: 'test-container-80',
                  },
                ],
              },
              moduleId: 'alb-module',
              type: AwsEcsAlbServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "^ @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       ]
      `);
    });

    it('should handle target healthCheck change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateTargetHealthCheck } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsAlbServiceModule>(
            appUpdateTargetHealthCheck,
            {
              inputs: {
                albName: 'test-alb',
                listeners: [
                  {
                    DefaultActions: [
                      {
                        action: {
                          TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                        },
                        actionType: 'forward',
                      },
                    ],
                    Port: 80,
                    rules: [],
                  },
                ],
                region: stub('${{testModule.model.region}}'),
                subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
                targets: [
                  {
                    containerName: 'test-container',
                    containerPort: 80,
                    execution: stub('${{testExecutionModule.model.execution}}'),
                    healthCheck: { ...HEALTH_CHECK_RESPONSE, UnhealthyThresholdCount: 4 },
                    Name: 'test-container-80',
                  },
                ],
              },
              moduleId: 'alb-module',
              type: AwsEcsAlbServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       ]
      `);
    });

    it('should handle target name change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appCreate,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdateTargetName } = await setup(testModuleContainer);
      // The target group name is force-new on aws_lb_target_group → octo emits a REPLACE.
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsEcsAlbServiceModule>(
            appUpdateTargetName,
            {
              inputs: {
                albName: 'test-alb',
                listeners: [
                  {
                    DefaultActions: [
                      {
                        action: {
                          TargetGroups: [{ targetGroupName: 'change-container-80', Weight: 100 }],
                        },
                        actionType: 'forward',
                      },
                    ],
                    Port: 80,
                    rules: [],
                  },
                ],
                region: stub('${{testModule.model.region}}'),
                subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
                targets: [
                  {
                    containerName: 'test-container',
                    containerPort: 80,
                    execution: stub('${{testExecutionModule.model.execution}}'),
                    healthCheck: HEALTH_CHECK_RESPONSE,
                    Name: 'change-container-80',
                  },
                ],
              },
              moduleId: 'alb-module',
              type: AwsEcsAlbServiceModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "^ @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
         "* @octo/alb-listener=alb-listener-test-alb",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcsAlbServiceModule>(
        appCreate,
        {
          inputs: {
            albName: 'test-alb',
            listeners: [
              {
                DefaultActions: [
                  {
                    action: {
                      TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                    },
                    actionType: 'forward',
                  },
                ],
                Port: 80,
                rules: [],
              },
            ],
            region: stub('${{testModule.model.region}}'),
            subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
            targets: [
              {
                containerName: 'test-container',
                containerPort: 80,
                execution: stub('${{testExecutionModule.model.execution}}'),
                healthCheck: HEALTH_CHECK_RESPONSE,
                Name: 'test-container-80',
              },
            ],
          },
          moduleId: 'alb-module-1',
          type: AwsEcsAlbServiceModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsEcsAlbServiceModule>(
          appUpdateModuleId,
          {
            inputs: {
              albName: 'test-alb',
              listeners: [
                {
                  DefaultActions: [
                    {
                      action: {
                        TargetGroups: [{ targetGroupName: 'test-container-80', Weight: 100 }],
                      },
                      actionType: 'forward',
                    },
                  ],
                  Port: 80,
                  rules: [],
                },
              ],
              region: stub('${{testModule.model.region}}'),
              subnets: [stub('${{testSubnet1Module.model.subnet}}'), stub('${{testSubnet2Module.model.subnet}}')],
              targets: [
                {
                  containerName: 'test-container',
                  containerPort: 80,
                  execution: stub('${{testExecutionModule.model.execution}}'),
                  healthCheck: HEALTH_CHECK_RESPONSE,
                  Name: 'test-container-80',
                },
              ],
            },
            moduleId: 'alb-module-2',
            type: AwsEcsAlbServiceModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });
});
