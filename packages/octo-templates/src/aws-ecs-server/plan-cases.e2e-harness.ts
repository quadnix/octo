/**
 * SCRATCH HARNESS — named `.e2e-harness.ts` so neither `test` nor `test:e2e` picks it up; it
 * creates real AWS infrastructure and must only be run by hand. Runs the `input changes` plan-digest cases from
 * main.e2e-spec.ts against the already-applied stack in `.octo-incremental/hunt`, in the same order
 * and the same process, so their sequential contamination behaves as it does in the real spec.
 *
 * Plan-only: creates nothing. Requires the `alb` stage of incremental.e2e-spec.ts to be applied.
 *
 *   OCTO_WORK=hunt jest --testRegex "plan-cases\.e2e-harness\.ts$"
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import {
  type Deployment,
  type Execution,
  LocalStateProvider,
  SubnetType,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import { AwsMultiAzRegionId } from '@quadnix/octo-aws-cdk/modules/region/aws-multi-az-region/schema';
import { config } from './app.config.js';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';
const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-ecs-server' };

const workDir = join(__dirname, '.octo-incremental', process.env.OCTO_WORK ?? 'hunt');
const stateDir = join(workDir, 'state');
const outputDir = join(workDir, 'generated');

const NAT = process.env.OCTO_NAT === 'on';

type Overrides = { [moduleId: string]: (inputs: any) => any };

/**
 * Ported verbatim from main.e2e-spec.ts `input changes`, in source order.
 */
const CASES: { name: string; overrides: Overrides }[] = [
  { name: 'SimpleAppModule/name', overrides: { 'app-module': (i) => ({ ...i, name: 'changed-name' }) } },
  {
    name: 'AwsIniAccountModule/accountId',
    overrides: { 'account-module': (i) => ({ ...i, accountId: 'changed-account-id' }) },
  },
  {
    name: 'AwsMultiAzRegionModule/name',
    overrides: { 'region-module': (i) => ({ ...i, name: 'changed-region-name' }) },
  },
  {
    name: 'AwsMultiAzRegionModule/regionIds',
    overrides: {
      'region-module': (i) => ({
        ...i,
        regionIds: [
          AwsMultiAzRegionId.AWS_US_EAST_1A,
          AwsMultiAzRegionId.AWS_US_EAST_1B,
          AwsMultiAzRegionId.AWS_US_EAST_1C,
        ],
      }),
    },
  },
  {
    name: 'AwsMultiAzRegionModule/vpcCidrBlock',
    overrides: { 'region-module': (i) => ({ ...i, vpcCidrBlock: '10.0.1.0/16' }) },
  },
  {
    name: 'AwsEcsServerModule/serverKey',
    overrides: { 'backend-server-module': (i) => ({ ...i, serverKey: 'changed-backend' }) },
  },
  {
    name: 'AwsEcsDeploymentModule/deploymentContainerProperties',
    overrides: {
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
    },
  },
  {
    name: 'AwsEcsDeploymentModule/deploymentTag',
    overrides: { 'backend-deployment-v1-module': (i) => ({ ...i, deploymentTag: 'v2' }) },
  },
  {
    name: 'AwsEcsEnvironmentModule/environmentName',
    overrides: { 'qa-environment-module': (i) => ({ ...i, environmentName: 'changed-qa' }) },
  },
  {
    name: 'AwsEcsEnvironmentModule/environmentVariables',
    overrides: {
      'qa-environment-module': (i) => ({ ...i, environmentVariables: { EXTRA_VAR: 'value', NODE_ENV: 'qa' } }),
    },
  },
  {
    name: 'AwsSimpleSubnetModule/subnetAvailabilityZone',
    overrides: { 'public-subnet-module': (i) => ({ ...i, subnetAvailabilityZone: 'us-east-1b' }) },
  },
  {
    name: 'AwsSimpleSubnetModule/subnetCidrBlock',
    overrides: { 'public-subnet-module': (i) => ({ ...i, subnetCidrBlock: '10.0.3.0/24' }) },
  },
  {
    name: 'AwsSimpleSubnetModule/subnetName',
    overrides: { 'public-subnet-module': (i) => ({ ...i, subnetName: 'changed-public-subnet' }) },
  },
  {
    name: 'AwsSimpleSubnetModule/subnetOptions',
    overrides: {
      'public-subnet-module': (i) => ({
        ...i,
        subnetOptions: { createNatGateway: true, disableSubnetIntraNetwork: true, subnetType: SubnetType.PUBLIC },
      }),
    },
  },
  {
    name: 'AwsEcsExecutionModule/deployments',
    overrides: {
      'backend-v1-qa-execution-module': (i) => ({
        ...i,
        deployments: {
          main: {
            containerProperties: { image: { essential: true, name: 'backend-v2' } },
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
    },
  },
  {
    name: 'AwsEcsExecutionModule/desiredCount',
    overrides: { 'backend-v1-qa-execution-module': (i) => ({ ...i, desiredCount: 2 }) },
  },
  {
    name: 'AwsEcsExecutionModule/executionId',
    overrides: { 'backend-v1-qa-execution-module': (i) => ({ ...i, executionId: 'changed-execution-id' }) },
  },
  {
    name: 'AwsEcsExecutionModule/securityGroupRules',
    overrides: {
      'backend-v1-qa-execution-module': (i) => ({
        ...i,
        securityGroupRules: [
          { CidrBlock: '0.0.0.0/0', Egress: false, FromPort: 80, IpProtocol: 'tcp', ToPort: 80 },
          { CidrBlock: '10.0.0.0/8', Egress: true, FromPort: 8080, IpProtocol: 'tcp', ToPort: 8080 },
        ],
      }),
    },
  },
  {
    name: 'AwsEcsAlbServiceModule/albName',
    overrides: { 'qa-api-alb-module': (i) => ({ ...i, albName: 'changed-qa-api-alb' }) },
  },
  {
    name: 'AwsEcsAlbServiceModule/listenersPort',
    overrides: {
      'qa-api-alb-module': (i) => ({
        ...i,
        listeners: [
          {
            DefaultActions: [
              { action: { TargetGroups: [{ targetGroupName: 'backend-v1-80', Weight: 100 }] }, actionType: 'forward' },
            ],
            Port: 443,
            rules: [],
          },
        ],
      }),
    },
  },
  {
    name: 'AwsEcsAlbServiceModule/listenersRules',
    overrides: {
      'qa-api-alb-module': (i) => ({
        ...i,
        listeners: [
          {
            DefaultActions: [
              { action: { TargetGroups: [{ targetGroupName: 'backend-v1-80', Weight: 100 }] }, actionType: 'forward' },
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
    },
  },
  {
    name: 'AwsEcsAlbServiceModule/targetsHealthCheck',
    overrides: {
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
    },
  },
];

const only = process.env.OCTO_CASE;
const selected = only ? CASES.filter((c) => c.name === only) : CASES;

jest.setTimeout(1_800_000);

describe('Plan cases', () => {
  let moduleDefinitions: ModuleDefinitions;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize(new LocalStateProvider(stateDir));

    testModuleContainer.registerTerraformConfig({
      minTerraformVersion: '1.6.0',
      providers: { aws: { minVersion: '5.0.0', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', config.AWS_ACCOUNT_ID, AWS_REGION_ID);
    testModuleContainer.registerTags([{ scope: {}, tags: E2E_TAGS }]);

    moduleDefinitions = new ModuleDefinitions();
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  // The applied baseline has NAT off (see incremental.e2e-spec.ts), so the baseline intent must match
  // it, or every case would additionally diff the NAT gateway.
  const natBaseline: Overrides = NAT
    ? {}
    : {
        'private-subnet-module': (i) => ({
          ...i,
          subnetSiblings: (i.subnetSiblings ?? []).map((s: any) => ({ ...s, attachToNatGateway: false })),
        }),
        'public-subnet-module': (i) => ({ ...i, subnetOptions: { ...i.subnetOptions, createNatGateway: false } }),
      };

  it.each(selected.map((c) => [c.name, c.overrides] as const))('%s', async (name, overrides) => {
    const merged: Overrides = { ...natBaseline };
    for (const [moduleId, fn] of Object.entries(overrides)) {
      const base = natBaseline[moduleId];
      merged[moduleId] = base ? (i): any => fn(base(i)) : fn;
    }

    const modules = moduleDefinitions.getAll().map((md) => ({
      inputs: merged[md.moduleId] ? merged[md.moduleId](md.moduleInputs) : md.moduleInputs,
      moduleId: md.moduleId,
      type: md.module,
    }));

    let digest: string[];
    try {
      const { resourceDiffs } = (
        await testModuleContainer.runModules(modules, { outputDir, terraformTarget: 'plan' }).next()
      ).value!;
      digest = testModuleContainer.digestDiffs(resourceDiffs);
    } catch (error) {
      console.log(`### CASE ${name}\n!!! THREW: ${error.message}`);
      throw error;
    }

    console.log(`### CASE ${name}\n${digest.map((d) => `   ${d}`).join('\n') || '   (empty)'}`);
  });
});
