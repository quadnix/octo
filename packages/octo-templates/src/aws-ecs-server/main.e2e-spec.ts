import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import {
  type AModule,
  type AResource,
  type Container,
  type Deployment,
  type Execution,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { type AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-ini-account';
import { type SimpleAppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
import { AwsMultiAzRegionId } from '@quadnix/octo-aws-cdk/modules/region/aws-multi-az-region/schema';
import type { AlbSchema } from '@quadnix/octo-aws-cdk/resources/alb/schema';
import { HtmlReportEventListener } from '@quadnix/octo-event-listeners/html-report';
import { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import { mockClient } from 'aws-sdk-client-mock';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { ModuleDefinitions } from './module-definitions.js';

describe('Main E2E', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  const STSClientMock = mockClient(STSClient);

  const moduleDefinitions = new ModuleDefinitions();
  const accountId = moduleDefinitions.get<AwsIniAccountModule>('account-module')!.moduleInputs.accountId;

  const stateProvider = new TestStateProvider();

  beforeEach(async () => {
    STSClientMock.on(GetCallerIdentityCommand).resolves({ Account: accountId });

    container = await TestContainer.create({
      mocks: [
        {
          metadata: { package: '@octo' },
          type: STSClient,
          value: STSClientMock,
        },
      ],
    });

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(stateProvider, [
      { type: HtmlReportEventListener },
      { type: LoggingEventListener },
    ]);

    // Register tags on all resources.
    testModuleContainer.octo.registerTags([
      { scope: {}, tags: { 'e2e-test': 'true', 'e2e-test-family': 'aws-ecs-server' } },
    ]);
  });

  afterEach(async () => {
    STSClientMock.restore();

    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should have server available', async () => {
    await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
    const { 'app-module.model.app': app } = await testModuleContainer.runModules(
      moduleDefinitions.getAll().map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );
    const result = await testModuleContainer.commit(app);
    const albResource = result.resourceTransaction
      .flat()
      .find((t) => (t.node.constructor as typeof AResource).NODE_NAME === 'alb')!.node as AResource<AlbSchema, any>;
    const albDnsName = albResource.response.DNSName;

    const axiosClient = axios.create({ baseURL: `http://${albDnsName}` });
    // Retry for 3 minutes.
    axiosRetry(axiosClient, {
      retries: 18,
      retryCondition: (error) => error.response?.status !== 200,
      retryDelay: () => 10000,
    });
    const albResponse = await axiosClient.get(`/`);
    expect(albResponse.status).toBe(200);
  }, 600_000);

  describe('input changes', () => {
    describe('SimpleAppModule', () => {
      it('should handle name change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs: md.moduleId === 'app-module' ? { ...md.moduleInputs, name: 'changed-name' } : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [],
           [],
         ]
        `);
      });
    });

    describe('AwsIniAccountModule', () => {
      it('should handle accountId change', async () => {
        STSClientMock.restore();
        STSClientMock.on(GetCallerIdentityCommand).resolves({ Account: 'changed-account-id' });

        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'account-module'
                ? { ...md.moduleInputs, accountId: 'changed-account-id' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        // Changing accountId will effectively affect almost all resources
        // that depends on awsAccountId, and they will fail.
        // Here, the first diff has failed, but the same will happen for all resources.
        // To change accountId, users are expected to add a new account and move their
        // resources to it, rather than automating the whole migration.
        await expect(async () => {
          await testModuleContainer.commit(app, { skipResourceTransaction: true });
        }).rejects.toMatchInlineSnapshot(
          `[Error: Cannot update ECS Cluster immutable properties once it has been created!]`,
        );
      });
    });

    describe('AwsMultiAzRegionModule', () => {
      it('should handle name change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'region-module' ? { ...md.moduleInputs, name: 'changed-region-name' } : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        await expect(async () => {
          await testModuleContainer.commit(app, { skipResourceTransaction: true });
        }).rejects.toMatchInlineSnapshot(
          `[Error: Cannot update ECS Task Definition immutable properties once it has been created!]`,
        );
      });

      it('should handle regionIds change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'region-module'
                ? {
                    ...md.moduleInputs,
                    regionIds: [
                      AwsMultiAzRegionId.AWS_US_EAST_1A,
                      AwsMultiAzRegionId.AWS_US_EAST_1B,
                      AwsMultiAzRegionId.AWS_US_EAST_1C,
                    ],
                  }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        await expect(async () => {
          await testModuleContainer.commit(app, { skipResourceTransaction: true });
        }).rejects.toMatchInlineSnapshot(`[Error: Cannot update VPC immutable properties once it has been created!]`);
      });

      it('should handle vpcCidrBlock change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'region-module' ? { ...md.moduleInputs, vpcCidrBlock: '10.0.1.0/16' } : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        await expect(async () => {
          await testModuleContainer.commit(app, { skipResourceTransaction: true });
        }).rejects.toMatchInlineSnapshot(`[Error: Cannot update VPC immutable properties once it has been created!]`);
      });
    });

    describe('AwsEcsServerModule', () => {
      it('should handle serverKey change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'backend-server-module'
                ? { ...md.moduleInputs, serverKey: 'changed-backend' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        await expect(async () => {
          await testModuleContainer.commit(app, { skipResourceTransaction: true });
        }).rejects.toMatchInlineSnapshot(
          `[Error: Cannot update ECS Task Definition immutable properties once it has been created!]`,
        );
      });
    });

    describe('AwsEcsDeploymentModule', () => {
      it('should handle deploymentContainerProperties change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'backend-deployment-v1-module'
                ? {
                    ...md.moduleInputs,
                    deploymentContainerProperties: {
                      cpu: 512,
                      image: {
                        command: 'node webserver',
                        ports: [{ containerPort: 80, protocol: 'tcp' }],
                        uri: 'docker.io/ealen/echo-server:0.9.2',
                      },
                      memory: 1024,
                    },
                  }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-qa-execution",
               "value": "",
             },
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-service=ecs-service-backend-v1-qa-execution",
               "value": "",
             },
           ],
           [],
         ]
        `);
      });

      it('should handle deploymentTag change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'backend-deployment-v1-module'
                ? { ...md.moduleInputs, deploymentTag: 'v2' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-qa-execution",
               "value": "",
             },
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-service=ecs-service-backend-v1-qa-execution",
               "value": "",
             },
           ],
           [],
         ]
        `);
      });
    });

    describe('AwsEcsEnvironmentModule', () => {
      it('should handle environmentName change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'qa-environment-module'
                ? { ...md.moduleInputs, environmentName: 'changed-qa' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        await expect(async () => {
          await testModuleContainer.commit(app, { skipResourceTransaction: true });
        }).rejects.toMatchInlineSnapshot(
          `[Error: Cannot update ECS Task Definition immutable properties once it has been created!]`,
        );
      });

      it('should handle environmentVariables change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'qa-environment-module'
                ? { ...md.moduleInputs, environmentVariables: { EXTRA_VAR: 'value', NODE_ENV: 'qa' } }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-qa-execution",
               "value": "",
             },
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-service=ecs-service-backend-v1-qa-execution",
               "value": "",
             },
           ],
           [],
         ]
        `);
      });
    });

    describe('AwsSimpleSubnetModule', () => {
      it('should handle subnetAvailabilityZone change on public-subnet-module', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'public-subnet-module'
                ? { ...md.moduleInputs, subnetAvailabilityZone: 'us-east-1b' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        await expect(async () => {
          await testModuleContainer.commit(app, { skipResourceTransaction: true });
        }).rejects.toMatchInlineSnapshot(
          `[Error: Cannot update Subnet immutable properties once it has been created!]`,
        );
      });

      it('should handle subnetCidrBlock change on public-subnet-module', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'public-subnet-module'
                ? { ...md.moduleInputs, subnetCidrBlock: '10.0.3.0/24' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        await expect(async () => {
          await testModuleContainer.commit(app, { skipResourceTransaction: true });
        }).rejects.toMatchInlineSnapshot(
          `[Error: Cannot update Subnet immutable properties once it has been created!]`,
        );
      });

      it('should handle subnetName change on public-subnet-module', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'public-subnet-module'
                ? { ...md.moduleInputs, subnetName: 'changed-public-subnet' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/subnet=subnet-app-region-east-public-subnet",
               "value": "@octo/subnet=subnet-app-region-east-public-subnet",
             },
             {
               "action": "update",
               "field": "parent",
               "node": "@octo/alb=alb-app-region-east-qa-api-alb",
               "value": "subnets",
             },
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/nat-gateway=nat-gateway-app-region-east-public-subnet",
               "value": "@octo/nat-gateway=nat-gateway-app-region-east-public-subnet",
             },
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/network-acl=nacl-app-region-east-public-subnet",
               "value": "@octo/network-acl=nacl-app-region-east-public-subnet",
             },
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/route-table=rt-app-region-east-public-subnet",
               "value": "@octo/route-table=rt-app-region-east-public-subnet",
             },
             {
               "action": "delete",
               "field": "parent",
               "node": "@octo/route-table=rt-app-region-east-private-subnet",
               "value": "@octo/nat-gateway=nat-gateway-app-region-east-public-subnet",
             },
             {
               "action": "add",
               "field": "parent",
               "node": "@octo/route-table=rt-app-region-east-private-subnet",
               "value": "@octo/nat-gateway=nat-gateway-app-region-east-changed-public-subnet",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/subnet=subnet-app-region-east-changed-public-subnet",
               "value": "@octo/subnet=subnet-app-region-east-changed-public-subnet",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/nat-gateway=nat-gateway-app-region-east-changed-public-subnet",
               "value": "@octo/nat-gateway=nat-gateway-app-region-east-changed-public-subnet",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/route-table=rt-app-region-east-changed-public-subnet",
               "value": "@octo/route-table=rt-app-region-east-changed-public-subnet",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/network-acl=nacl-app-region-east-changed-public-subnet",
               "value": "@octo/network-acl=nacl-app-region-east-changed-public-subnet",
             },
           ],
           [],
         ]
        `);
      });

      it('should handle subnetOptions change on public-subnet-module', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'public-subnet-module'
                ? {
                    ...md.moduleInputs,
                    subnetOptions: {
                      createNatGateway: true,
                      disableSubnetIntraNetwork: true,
                      subnetType: SubnetType.PUBLIC,
                    },
                  }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "properties",
               "node": "@octo/network-acl=nacl-app-region-east-public-subnet",
               "value": {
                 "key": "entries",
                 "value": [
                   {
                     "CidrBlock": "10.0.0.0/24",
                     "Egress": false,
                     "PortRange": {
                       "From": -1,
                       "To": -1,
                     },
                     "Protocol": "-1",
                     "RuleAction": "deny",
                     "RuleNumber": 10,
                   },
                   {
                     "CidrBlock": "10.0.0.0/24",
                     "Egress": true,
                     "PortRange": {
                       "From": -1,
                       "To": -1,
                     },
                     "Protocol": "-1",
                     "RuleAction": "deny",
                     "RuleNumber": 10,
                   },
                   {
                     "CidrBlock": "0.0.0.0/0",
                     "Egress": false,
                     "PortRange": {
                       "From": -1,
                       "To": -1,
                     },
                     "Protocol": "-1",
                     "RuleAction": "allow",
                     "RuleNumber": 20,
                   },
                   {
                     "CidrBlock": "0.0.0.0/0",
                     "Egress": true,
                     "PortRange": {
                       "From": -1,
                       "To": -1,
                     },
                     "Protocol": "-1",
                     "RuleAction": "allow",
                     "RuleNumber": 20,
                   },
                   {
                     "CidrBlock": "10.0.2.0/24",
                     "Egress": false,
                     "PortRange": {
                       "From": -1,
                       "To": -1,
                     },
                     "Protocol": "-1",
                     "RuleAction": "allow",
                     "RuleNumber": 30,
                   },
                   {
                     "CidrBlock": "10.0.2.0/24",
                     "Egress": true,
                     "PortRange": {
                       "From": -1,
                       "To": -1,
                     },
                     "Protocol": "-1",
                     "RuleAction": "allow",
                     "RuleNumber": 30,
                   },
                 ],
               },
             },
           ],
           [],
         ]
        `);
      });
    });

    describe('AwsEcsExecutionModule', () => {
      it('should handle deployments change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'backend-v1-qa-execution-module'
                ? {
                    ...md.moduleInputs,
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
                  }
                : md.moduleId === 'qa-api-alb-module'
                  ? {
                      ...md.moduleInputs,
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
                    }
                  : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-qa-execution",
               "value": "",
             },
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-service=ecs-service-backend-v1-qa-execution",
               "value": "",
             },
           ],
           [],
         ]
        `);
      });

      it('should handle desiredCount change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'backend-v1-qa-execution-module'
                ? { ...md.moduleInputs, desiredCount: 2 }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-service=ecs-service-backend-v1-qa-execution",
               "value": "",
             },
           ],
           [],
         ]
        `);
      });

      it('should handle executionId change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'backend-v1-qa-execution-module'
                ? { ...md.moduleInputs, executionId: 'changed-execution-id' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-qa-execution",
               "value": "@octo/ecs-task-definition=ecs-task-definition-backend-v1-qa-execution",
             },
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/alb-target-group=alb-target-group-backend-v1-qa-execution",
               "value": "@octo/alb-target-group=alb-target-group-backend-v1-qa-execution",
             },
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-qa-execution",
               "value": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-qa-execution",
             },
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/ecs-service=ecs-service-backend-v1-qa-execution",
               "value": "@octo/ecs-service=ecs-service-backend-v1-qa-execution",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/security-group=sec-grp-SecurityGroup-changed-execution-id",
               "value": "@octo/security-group=sec-grp-SecurityGroup-changed-execution-id",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/ecs-task-definition=ecs-task-definition-changed-execution-id",
               "value": "@octo/ecs-task-definition=ecs-task-definition-changed-execution-id",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/ecs-service=ecs-service-changed-execution-id",
               "value": "@octo/ecs-service=ecs-service-changed-execution-id",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/alb-target-group=alb-target-group-changed-execution-id",
               "value": "@octo/alb-target-group=alb-target-group-changed-execution-id",
             },
           ],
           [],
         ]
        `);
      });

      it('should handle securityGroupRules change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'backend-v1-qa-execution-module'
                ? {
                    ...md.moduleInputs,
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
                  }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "properties",
               "node": "@octo/security-group=sec-grp-SecurityGroup-backend-v1-qa-execution",
               "value": {
                 "key": "rules",
                 "value": [
                   {
                     "CidrBlock": "0.0.0.0/0",
                     "Egress": false,
                     "FromPort": 80,
                     "IpProtocol": "tcp",
                     "ToPort": 80,
                   },
                   {
                     "CidrBlock": "10.0.0.0/8",
                     "Egress": true,
                     "FromPort": 8080,
                     "IpProtocol": "tcp",
                     "ToPort": 8080,
                   },
                 ],
               },
             },
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-service=ecs-service-backend-v1-qa-execution",
               "value": "",
             },
           ],
           [],
         ]
        `);
      });
    });

    describe('AwsEcsAlbServiceModule', () => {
      it('should handle albName change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'qa-api-alb-module'
                ? { ...md.moduleInputs, albName: 'changed-qa-api-alb' }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/security-group=sec-grp-app-region-east-qa-api-alb",
               "value": "@octo/security-group=sec-grp-app-region-east-qa-api-alb",
             },
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/alb=alb-app-region-east-qa-api-alb",
               "value": "@octo/alb=alb-app-region-east-qa-api-alb",
             },
             {
               "action": "delete",
               "field": "resourceId",
               "node": "@octo/alb-listener=alb-listener-qa-api-alb",
               "value": "@octo/alb-listener=alb-listener-qa-api-alb",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/security-group=sec-grp-app-region-east-changed-qa-api-alb",
               "value": "@octo/security-group=sec-grp-app-region-east-changed-qa-api-alb",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/alb=alb-app-region-east-changed-qa-api-alb",
               "value": "@octo/alb=alb-app-region-east-changed-qa-api-alb",
             },
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/alb-listener=alb-listener-changed-qa-api-alb",
               "value": "@octo/alb-listener=alb-listener-changed-qa-api-alb",
             },
             {
               "action": "update",
               "field": "properties",
               "node": "@octo/alb-listener=alb-listener-changed-qa-api-alb",
               "value": {
                 "DefaultActions": [],
               },
             },
           ],
           [],
         ]
        `);
      });

      it('should handle listeners Port change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'qa-api-alb-module'
                ? {
                    ...md.moduleInputs,
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
                  }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "properties",
               "node": "@octo/alb-listener=alb-listener-qa-api-alb",
               "value": {
                 "DefaultActions": [],
               },
             },
           ],
           [],
         ]
        `);
      });

      it('should handle listeners rules change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'qa-api-alb-module'
                ? {
                    ...md.moduleInputs,
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
                  }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "properties",
               "node": "@octo/alb-listener=alb-listener-qa-api-alb",
               "value": {
                 "Rule": {
                   "action": "add",
                   "rule": {
                     "Priority": 1,
                     "actions": [
                       {
                         "action": {
                           "TargetGroups": [
                             {
                               "Weight": 100,
                               "targetGroupName": "backend-v1-80",
                             },
                           ],
                         },
                         "actionType": "forward",
                       },
                     ],
                     "conditions": [
                       {
                         "condition": {
                           "Values": [
                             "/api",
                           ],
                         },
                         "conditionType": "path-pattern",
                       },
                     ],
                   },
                 },
               },
             },
           ],
           [],
         ]
        `);
      });

      it('should handle targets healthCheck change', async () => {
        await testModuleContainer.orderModules(moduleDefinitions.getAll().map((md) => md.module));
        const { 'app-module.model.app': app } = await testModuleContainer.runModules(
          moduleDefinitions.getAll().map((md) => ({
            hidden: false,
            inputs:
              md.moduleId === 'qa-api-alb-module'
                ? {
                    ...md.moduleInputs,
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
                  }
                : md.moduleInputs,
            moduleId: md.moduleId,
            type: md.module,
          })),
        );
        const result = await testModuleContainer.commit(app, { skipResourceTransaction: true });
        expect(result.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "properties",
               "node": "@octo/alb-target-group=alb-target-group-backend-v1-qa-execution",
               "value": "",
             },
             {
               "action": "update",
               "field": "resourceId",
               "node": "@octo/ecs-service=ecs-service-backend-v1-qa-execution",
               "value": "",
             },
           ],
           [],
         ]
        `);
      });
    });
  });

  it('should have no resources left after teardown', async () => {
    const appModule = moduleDefinitions.get<SimpleAppModule>('app-module')!;
    const accountModule = moduleDefinitions.get<AwsIniAccountModule>('account-module')!;

    await testModuleContainer.orderModules([appModule.module, accountModule.module]);
    const { 'app-module.model.app': app } = await testModuleContainer.runModules<AModule<any, any>>(
      [appModule, accountModule].map((md) => ({
        hidden: false,
        inputs: md.moduleInputs,
        moduleId: md.moduleId,
        type: md.module,
      })),
    );
    await testModuleContainer.commit(app);

    const resourceGroupsTaggingApiClient = await container.get<ResourceGroupsTaggingAPIClient, any>(
      ResourceGroupsTaggingAPIClient,
      {
        args: [accountId, 'us-east-1'],
        metadata: { package: '@octo' },
      },
    );

    const response = await resourceGroupsTaggingApiClient.send(
      new GetResourcesCommand({
        TagFilters: [
          { Key: 'e2e-test', Values: ['true'] },
          { Key: 'e2e-test-family', Values: ['aws-s3-website'] },
        ],
      }),
    );

    expect(response.ResourceTagMappingList!.map((r) => r.ResourceARN)).toEqual([]);
  }, 1_200_000);
});
