import {
  type AResource,
  type Account,
  type App,
  DiffAssert,
  MatchingResource,
  type Region,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsEcsServiceAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-service.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import type { EcsClusterSchema } from '../../../resources/ecs-cluster/index.schema.js';
import { EcsService } from '../../../resources/ecs-service/index.js';
import type { EcsTaskDefinitionSchema } from '../../../resources/ecs-task-definition/index.schema.js';
import type { InternetGatewaySchema } from '../../../resources/internet-gateway/index.schema.js';
import type { SubnetSchema } from '../../../resources/subnet/index.schema.js';
import type { VpcSchema } from '../../../resources/vpc/index.schema.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsEcsAlbServiceModule } from './index.js';

async function setup(
  testModuleContainer: TestModuleContainer,
  octoTerraform: OctoTerraform,
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

  const {
    '@octo/ecs-cluster=ecs-cluster-region-qa': ecsClusterResource,
    '@octo/internet-gateway=igw-region': igwResource,
    '@octo/vpc=vpc-region': vpcResource,
  } = await testModuleContainer.createTestResources<[EcsClusterSchema, InternetGatewaySchema, VpcSchema]>(
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
      },
      {
        properties: {
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          internetGatewayName: 'default',
        },
        resourceContext: '@octo/internet-gateway=igw-region',
        response: { InternetGatewayId: 'InternetGatewayId' },
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
          response: { SubnetId: 'SubnetId' },
        },
      ],
      { save: true },
    );
  const { '@octo/subnet=subnet-region-public-subnet-2': subnet2Resource } =
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
          response: { SubnetId: 'SubnetId' },
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
          revision: 1,
          taskDefinitionArn: 'taskDefinitionArn',
        },
      },
    ],
    { save: true },
  );

  const ecsClusterOctoResource = octoTerraform.addOctoTerraformResource(ecsClusterResource);
  ecsClusterOctoResource.output({
    clusterArn: octoTerraform.raw('mock.clusterArn'),
  });
  const igwOctoResource = octoTerraform.addOctoTerraformResource(igwResource);
  igwOctoResource.output({
    InternetGatewayId: octoTerraform.raw('mock.InternetGatewayId'),
  });
  const vpcOctoResource = octoTerraform.addOctoTerraformResource(vpcResource);
  vpcOctoResource.output({
    VpcId: octoTerraform.raw('mock.VpcId'),
  });
  const subnet1OctoResource = octoTerraform.addOctoTerraformResource(subnet1Resource);
  subnet1OctoResource.output({
    SubnetArn: octoTerraform.raw('mock.Subnet1Arn'),
    SubnetId: octoTerraform.raw('mock.Subnet1Id'),
  });
  const subnet2OctoResource = octoTerraform.addOctoTerraformResource(subnet2Resource);
  subnet2OctoResource.output({
    SubnetArn: octoTerraform.raw('mock.Subnet2Arn'),
    SubnetId: octoTerraform.raw('mock.Subnet2Id'),
  });
  const ecsTaskDefinitionOctoResource = octoTerraform.addOctoTerraformResource(ecsTaskDefinitionResource);
  ecsTaskDefinitionOctoResource.output({
    revision: '1',
    taskDefinitionArn: octoTerraform.raw('mock.taskDefinitionArn'),
  });

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
  let hcl: HclAssert;
  let octoTerraform: OctoTerraform;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(
      { mocks: [{ metadata: { package: '@octo' }, type: OctoTerraform, value: new OctoTerraform() }] },
      { factoryTimeoutInMs: 500 },
    );
    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    octoTerraform = await container.get(OctoTerraform, { metadata: { package: '@octo' } });
    octoTerraform.addTerraformConfig();
    octoTerraform.addTerraformProvider('123', 'us-east-1');

    hcl = new HclAssert(octoTerraform);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['alb-module'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcsAlbServiceModelAction",
       ],
       [
         "AddAwsEcsAlbServiceOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CaptureSecurityGroupResponseResourceAction",
         "CaptureAlbTargetGroupResponseResourceAction",
       ],
       [
         "CaptureAlbResponseResourceAction",
       ],
       [
         "CaptureAlbListenerResponseResourceAction",
       ],
       [
         "CaptureAlbListenerResponseResourceAction",
         "CaptureAlbListenerResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-region-test-alb",
       "+ @octo/alb=alb-region-test-alb",
       "+ @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "+ @octo/alb-listener=alb-listener-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
     ]
    `);
    expect(octoTerraform.render()).toMatchInlineSnapshot(`
     "terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source  = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "123-us-east-1"
       region = "us-east-1"
     }

     output "ecs-cluster-region-qa-clusterArn" {
       value = mock.clusterArn
     }

     output "igw-region-InternetGatewayId" {
       value = mock.InternetGatewayId
     }

     output "vpc-region-VpcId" {
       value = mock.VpcId
     }

     output "subnet-region-public-subnet-1-SubnetArn" {
       value = mock.Subnet1Arn
     }

     output "subnet-region-public-subnet-1-SubnetId" {
       value = mock.Subnet1Id
     }

     output "subnet-region-public-subnet-2-SubnetArn" {
       value = mock.Subnet2Arn
     }

     output "subnet-region-public-subnet-2-SubnetId" {
       value = mock.Subnet2Id
     }

     output "ecs-task-definition-backend-v1-region-qa-public-subnet-1-revision" {
       value = "1"
     }

     output "ecs-task-definition-backend-v1-region-qa-public-subnet-1-taskDefinitionArn" {
       value = mock.taskDefinitionArn
     }

     resource "aws_security_group" "sec-grp-region-test-alb" {
       provider = aws.123-us-east-1
       vpc_id = mock.VpcId
     }

     resource "aws_vpc_security_group_ingress_rule" "sec-grp-region-test-alb_ingress_0" {
       provider = aws.123-us-east-1
       cidr_ipv4 = "0.0.0.0/0"
       description = "tcp 80-80 0.0.0.0/0"
       ip_protocol = "tcp"
       security_group_id = aws_security_group.sec-grp-region-test-alb.id
       from_port = 80
       to_port = 80

       depends_on = [aws_security_group.sec-grp-region-test-alb]
     }

     resource "aws_vpc_security_group_egress_rule" "sec-grp-region-test-alb_egress_0" {
       provider = aws.123-us-east-1
       cidr_ipv4 = "0.0.0.0/0"
       description = "tcp 0-65535 0.0.0.0/0"
       ip_protocol = "tcp"
       security_group_id = aws_security_group.sec-grp-region-test-alb.id
       from_port = 0
       to_port = 65535

       depends_on = [aws_vpc_security_group_ingress_rule.sec-grp-region-test-alb_ingress_0]
     }

     output "sec-grp-region-test-alb-Arn" {
       value = aws_security_group.sec-grp-region-test-alb.arn
     }

     output "sec-grp-region-test-alb-GroupId" {
       value = aws_security_group.sec-grp-region-test-alb.id
     }

     resource "aws_lb" "alb-region-test-alb" {
       provider = aws.123-us-east-1
       internal = false
       ip_address_type = "ipv4"
       load_balancer_type = "application"
       name = "test-alb"
       security_groups = [aws_security_group.sec-grp-region-test-alb.id]
       subnets = [mock.Subnet1Id, mock.Subnet2Id]
     }

     output "alb-region-test-alb-DNSName" {
       value = aws_lb.alb-region-test-alb.dns_name
     }

     output "alb-region-test-alb-LoadBalancerArn" {
       value = aws_lb.alb-region-test-alb.arn
     }

     resource "aws_lb_target_group" "alb-target-group-backend-v1-region-qa-public-subnet-1" {
       provider = aws.123-us-east-1
       ip_address_type = "ipv4"
       name = "test-container-80"
       port = 80
       protocol = "HTTP"
       protocol_version = "HTTP1"
       target_type = "ip"
       vpc_id = mock.VpcId
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

     output "alb-target-group-backend-v1-region-qa-public-subnet-1-TargetGroupArn" {
       value = aws_lb_target_group.alb-target-group-backend-v1-region-qa-public-subnet-1.arn
     }

     resource "aws_lb_listener" "alb-listener-test-alb" {
       provider = aws.123-us-east-1
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
       provider = aws.123-us-east-1
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

     output "alb-listener-test-alb-ListenerArn" {
       value = aws_lb_listener.alb-listener-test-alb.arn
     }

     resource "aws_ecs_service" "ecs-service-backend-v1-region-qa-public-subnet-1" {
       provider = aws.123-us-east-1
       cluster = mock.clusterArn
       desired_count = 1
       launch_type = "FARGATE"
       name = "backend"
       network_configuration {
         assign_public_ip = true
         subnets = [mock.Subnet1Id]
       }
       task_definition = mock.taskDefinitionArn
       load_balancer {
         container_name = "test-container"
         container_port = 80
         target_group_arn = aws_lb_target_group.alb-target-group-backend-v1-region-qa-public-subnet-1.arn
       }
     }

     output "ecs-service-backend-v1-region-qa-public-subnet-1-serviceArn" {
       value = aws_ecs_service.ecs-service-backend-v1-region-qa-public-subnet-1.id
     }"
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/security-group=sec-grp-region-test-alb",
       "+ @octo/alb=alb-region-test-alb",
       "+ @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "+ @octo/alb-listener=alb-listener-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appAddListenerRule } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const resultAddListenerRule = await testModuleContainer.commit(appAddListenerRule, { enableResourceCapture: true });
    expect(new DiffAssert(resultAddListenerRule.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/alb-listener=alb-listener-test-alb",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appUpdateListenerRule } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const resultUpdateListenerRule = await testModuleContainer.commit(appUpdateListenerRule, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultUpdateListenerRule.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/alb-listener=alb-listener-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDelete } = await setup(testModuleContainer, octoTerraform);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "- @octo/security-group=sec-grp-region-test-alb",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       "- @octo/alb=alb-region-test-alb",
       "- @octo/alb-listener=alb-listener-test-alb",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
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
    expect(hcl.digest()).toMatchSnapshot();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "* @octo/security-group=sec-grp-region-test-alb",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       "* @octo/alb=alb-region-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDeleteTags } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module',
      type: AwsEcsAlbServiceModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       "* @octo/security-group=sec-grp-region-test-alb",
       "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       "* @octo/alb=alb-region-test-alb",
       "* @octo/alb-listener=alb-listener-test-alb",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();
  });

  describe('input changes', () => {
    it('should handle albName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateAlbName } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      const resultUpdateAlbName = await testModuleContainer.commit(appUpdateAlbName, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateAlbName.resourceDiffs).digest()).toMatchInlineSnapshot(`
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
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle listener DefaultActions change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateListenerDefaultAction } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
      });
      const resultUpdateListenerDefaultAction = await testModuleContainer.commit(appUpdateListenerDefaultAction, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateListenerDefaultAction.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "- @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
         "* @octo/alb-listener=alb-listener-test-alb",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle listener Port change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateListenerPort } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      const resultUpdateListenerPort = await testModuleContainer.commit(appUpdateListenerPort, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateListenerPort.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "* @octo/alb-listener=alb-listener-test-alb",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle listener rules change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateListenerRule } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      const resultUpdateListenerRule = await testModuleContainer.commit(appUpdateListenerRule, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateListenerRule.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "* @octo/alb-listener=alb-listener-test-alb",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle target add change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateTargetAddNewTarget } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      const resultUpdateTargetAddNewTarget = await testModuleContainer.commit(appUpdateTargetAddNewTarget, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateTargetAddNewTarget.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
         "* @octo/alb-listener=alb-listener-test-alb",
         "+ @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle target containerName change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateTargetContainerName } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      const resultUpdateTargetContainerName = await testModuleContainer.commit(appUpdateTargetContainerName, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateTargetContainerName.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle target containerPort change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateTargetContainerPort } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateTargetContainerPort, {
          enableResourceCapture: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot update ALB Target Group immutable properties once it has been created!"`,
      );
    });

    it('should handle target healthCheck change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateTargetHealthCheck } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 4, // change.
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      const resultUpdateTargetHealthCheck = await testModuleContainer.commit(appUpdateTargetHealthCheck, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateTargetHealthCheck.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "* @octo/alb-target-group=alb-target-group-backend-v1-region-qa-public-subnet-1",
         "* @octo/ecs-service=ecs-service-backend-v1-region-qa-public-subnet-1",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle target name change', async () => {
      const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'test-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateTargetName } = await setup(testModuleContainer, octoTerraform);
      await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
              healthCheck: {
                HealthCheckIntervalSeconds: 30,
                HealthCheckPath: '/health',
                HealthCheckPort: 80,
                HealthCheckProtocol: 'HTTP',
                HealthCheckTimeoutSeconds: 5,
                HealthyThresholdCount: 3,
                Matcher: { HttpCode: 200 },
                UnhealthyThresholdCount: 3,
              },
              Name: 'change-container-80',
            },
          ],
        },
        moduleId: 'alb-module',
        type: AwsEcsAlbServiceModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateTargetName, {
          enableResourceCapture: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot update ALB Target Group immutable properties once it has been created!"`,
      );
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module-1',
      type: AwsEcsAlbServiceModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

    const { app: appUpdateModuleId } = await setup(testModuleContainer, octoTerraform);
    await testModuleContainer.runModule<AwsEcsAlbServiceModule>({
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
            healthCheck: {
              HealthCheckIntervalSeconds: 30,
              HealthCheckPath: '/health',
              HealthCheckPort: 80,
              HealthCheckProtocol: 'HTTP',
              HealthCheckTimeoutSeconds: 5,
              HealthyThresholdCount: 3,
              Matcher: { HttpCode: 200 },
              UnhealthyThresholdCount: 3,
            },
            Name: 'test-container-80',
          },
        ],
      },
      moduleId: 'alb-module-2',
      type: AwsEcsAlbServiceModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();
  });
});
