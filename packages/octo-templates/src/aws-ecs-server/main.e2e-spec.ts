import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import {
  type App,
  type Deployment,
  type Execution,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AwsMultiAzRegionId } from '@quadnix/octo-aws-cdk/modules/region/aws-multi-az-region/schema';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { config } from './app.config.js';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const outputDir = join(__dirname, '.octo', 'generated');

const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-ecs-server' };

jest.setTimeout(1_800_000);

describe('Main E2E', () => {
  let app: App;
  let moduleDefinitions: ModuleDefinitions;
  let stateProvider: TestStateProvider;
  let testModuleContainer: TestModuleContainer;

  beforeAll(() => {
    stateProvider = new TestStateProvider();
  });

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize(stateProvider);

    testModuleContainer.registerTerraformConfig({
      minTerraformVersion: '1.6.0',
      providers: { aws: { minVersion: '5.0.0', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', config.AWS_ACCOUNT_ID, AWS_REGION_ID);

    // Register tags on all resources.
    testModuleContainer.registerTags([{ scope: {}, tags: E2E_TAGS }]);

    ({
      app: [app],
    } = await testModuleContainer.createTestModels('app-module', { app: ['aws-ecs-server'] }));

    moduleDefinitions = new ModuleDefinitions();
    // Replace real app with test app.
    moduleDefinitions.remove('app-module');
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
    const { resourceDiffs } = (
      await testModuleContainer.runModules(app, buildModules(overrides), { outputDir, terraformTarget: 'plan' }).next()
    ).value!;
    return testModuleContainer.digestDiffs(resourceDiffs);
  };

  it('should have server available', async () => {
    const { responses } = (
      await testModuleContainer
        .runModules(
          app,
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
        expect(await planDigest({ 'app-module': (i) => ({ ...i, name: 'changed-name' }) })).toMatchInlineSnapshot();
      });
    });

    describe('AwsIniAccountModule', () => {
      it('should handle accountId change', async () => {
        expect(
          await planDigest({ 'account-module': (i) => ({ ...i, accountId: 'changed-account-id' }) }),
        ).toMatchInlineSnapshot();
      });
    });

    describe('AwsMultiAzRegionModule', () => {
      it('should handle name change', async () => {
        expect(
          await planDigest({ 'region-module': (i) => ({ ...i, name: 'changed-region-name' }) }),
        ).toMatchInlineSnapshot();
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
        ).toMatchInlineSnapshot();
      });

      it('should handle vpcCidrBlock change', async () => {
        expect(
          await planDigest({ 'region-module': (i) => ({ ...i, vpcCidrBlock: '10.0.1.0/16' }) }),
        ).toMatchInlineSnapshot();
      });
    });

    describe('AwsEcsServerModule', () => {
      it('should handle serverKey change', async () => {
        expect(
          await planDigest({ 'backend-server-module': (i) => ({ ...i, serverKey: 'changed-backend' }) }),
        ).toMatchInlineSnapshot();
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
        ).toMatchInlineSnapshot();
      });

      it('should handle deploymentTag change', async () => {
        expect(
          await planDigest({ 'backend-deployment-v1-module': (i) => ({ ...i, deploymentTag: 'v2' }) }),
        ).toMatchInlineSnapshot();
      });
    });

    describe('AwsEcsEnvironmentModule', () => {
      it('should handle environmentName change', async () => {
        expect(
          await planDigest({ 'qa-environment-module': (i) => ({ ...i, environmentName: 'changed-qa' }) }),
        ).toMatchInlineSnapshot();
      });

      it('should handle environmentVariables change', async () => {
        expect(
          await planDigest({
            'qa-environment-module': (i) => ({ ...i, environmentVariables: { EXTRA_VAR: 'value', NODE_ENV: 'qa' } }),
          }),
        ).toMatchInlineSnapshot();
      });
    });

    describe('AwsSimpleSubnetModule', () => {
      it('should handle subnetAvailabilityZone change on public-subnet-module', async () => {
        expect(
          await planDigest({ 'public-subnet-module': (i) => ({ ...i, subnetAvailabilityZone: 'us-east-1b' }) }),
        ).toMatchInlineSnapshot();
      });

      it('should handle subnetCidrBlock change on public-subnet-module', async () => {
        expect(
          await planDigest({ 'public-subnet-module': (i) => ({ ...i, subnetCidrBlock: '10.0.3.0/24' }) }),
        ).toMatchInlineSnapshot();
      });

      it('should handle subnetName change on public-subnet-module', async () => {
        expect(
          await planDigest({ 'public-subnet-module': (i) => ({ ...i, subnetName: 'changed-public-subnet' }) }),
        ).toMatchInlineSnapshot();
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
        ).toMatchInlineSnapshot();
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
        ).toMatchInlineSnapshot();
      });

      it('should handle desiredCount change', async () => {
        expect(
          await planDigest({ 'backend-v1-qa-execution-module': (i) => ({ ...i, desiredCount: 2 }) }),
        ).toMatchInlineSnapshot();
      });

      it('should handle executionId change', async () => {
        expect(
          await planDigest({
            'backend-v1-qa-execution-module': (i) => ({ ...i, executionId: 'changed-execution-id' }),
          }),
        ).toMatchInlineSnapshot();
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
        ).toMatchInlineSnapshot();
      });
    });

    describe('AwsEcsAlbServiceModule', () => {
      it('should handle albName change', async () => {
        expect(
          await planDigest({ 'qa-api-alb-module': (i) => ({ ...i, albName: 'changed-qa-api-alb' }) }),
        ).toMatchInlineSnapshot();
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
        ).toMatchInlineSnapshot();
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
        ).toMatchInlineSnapshot();
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
        ).toMatchInlineSnapshot();
      });
    });
  });

  it('should have no resources left after teardown', async () => {
    for (const moduleId of moduleDefinitions
      .getAll()
      .map((md) => md.moduleId)
      .filter((moduleId) => moduleId !== 'account-module')) {
      moduleDefinitions.remove(moduleId);
    }

    await testModuleContainer
      .runModules(
        app,
        moduleDefinitions.getAll().map((md) => ({ inputs: md.moduleInputs, moduleId: md.moduleId, type: md.module })),
        { outputDir, terraformTarget: 'apply' },
      )
      .next();

    const awsResourcesUtility = new AwsTagsUtility(AWS_REGION_ID);
    const leftoverArns = await awsResourcesUtility.getResourceArnsByTags(E2E_TAGS);
    expect(leftoverArns).toEqual([]);
  });
});
