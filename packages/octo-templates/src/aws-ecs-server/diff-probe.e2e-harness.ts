/**
 * SCRATCH HARNESS — named `.e2e-harness.ts` so neither `test` nor `test:e2e` picks it up; it
 * creates real AWS infrastructure and must only be run by hand. Prints octo's raw resource diffs
 * (action + field, not just the digest) for one input change. Drives `Octo` directly and stops after
 * `generate()`, so validate never runs and nothing touches AWS.
 *
 *   OCTO_PROBE_STATE=/tmp/probe-state jest --testRegex "diff-probe\.e2e-harness\.ts$"
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { LocalStateProvider, Octo, TestContainer } from '@quadnix/octo';
import { config } from './app.config.js';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';
const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-ecs-server' };

const stateDir = process.env.OCTO_PROBE_STATE!;
const outputDir = join(__dirname, '.octo-incremental', 'probe-generated');

type Overrides = { [moduleId: string]: (inputs: any) => any };

const natBaseline: Overrides = {
  'private-subnet-module': (i) => ({
    ...i,
    subnetSiblings: (i.subnetSiblings ?? []).map((s: any) => ({ ...s, attachToNatGateway: false })),
  }),
  'public-subnet-module': (i) => ({ ...i, subnetOptions: { ...i.subnetOptions, createNatGateway: false } }),
};

const PROBES: { name: string; overrides: Overrides }[] = [
  { name: 'baseline-unchanged', overrides: {} },
  {
    name: 'executionId',
    overrides: { 'backend-v1-qa-execution-module': (i) => ({ ...i, executionId: 'changed-execution-id' }) },
  },
  {
    name: 'deploymentTag',
    overrides: { 'backend-deployment-v1-module': (i) => ({ ...i, deploymentTag: 'v2' }) },
  },
  {
    name: 'subnetAvailabilityZone',
    overrides: { 'public-subnet-module': (i) => ({ ...i, subnetAvailabilityZone: 'us-east-1b' }) },
  },
  {
    name: 'securityGroupRules',
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
];

jest.setTimeout(600_000);

describe('Diff probe', () => {
  afterEach(async () => {
    await TestContainer.reset();
  });

  it.each(PROBES.map((p) => [p.name, p.overrides] as const))('%s', async (name, overrides) => {
    await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    const octo = new Octo();
    await octo.initialize(new LocalStateProvider(stateDir));

    octo.registerTerraformConfig({
      minTerraformVersion: '1.6.0',
      providers: { aws: { minVersion: '5.0.0', source: 'hashicorp/aws' } },
    });
    octo.registerTerraformProvider('aws', config.AWS_ACCOUNT_ID, AWS_REGION_ID);
    octo.registerTags([{ scope: {}, tags: E2E_TAGS }]);

    const moduleDefinitions = new ModuleDefinitions();
    const merged: Overrides = { ...natBaseline };
    for (const [moduleId, fn] of Object.entries(overrides)) {
      const base = natBaseline[moduleId];
      merged[moduleId] = base ? (i): any => fn(base(i)) : fn;
    }

    const types: any[] = [];
    for (const md of moduleDefinitions.getAll()) {
      const inputs = merged[md.moduleId] ? merged[md.moduleId](md.moduleInputs) : md.moduleInputs;
      octo.loadModule(md.module, md.moduleId, inputs);
      types.push(md.module);
    }
    octo.orderModules(types);

    await octo.compose();
    const app = octo.getRootModel();
    const resourceDiffs = await octo.generate(app, { outputDir: join(outputDir, name) });

    const lines: string[] = [];
    for (const group of resourceDiffs) {
      for (const d of group as any[]) {
        const diff = d.diff ?? d;
        const node = diff.node;
        const context = typeof (node as any)?.getContext === 'function' ? node.getContext() : String(node);
        const value =
          typeof diff.value === 'object' && diff.value !== null
            ? (diff.value.getContext?.() ?? JSON.stringify(diff.value).slice(0, 120))
            : String(diff.value).slice(0, 120);
        lines.push(`${String(diff.action).padEnd(8)} field=${String(diff.field).padEnd(12)} ${context}  <= ${value}`);
      }
    }

    console.log(`### PROBE ${name}\n${lines.join('\n') || '   (no diffs)'}`);
  });
});
