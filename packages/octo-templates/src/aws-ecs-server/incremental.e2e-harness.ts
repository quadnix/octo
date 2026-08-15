/**
 * SCRATCH HARNESS — named `.e2e-harness.ts` so neither `test` nor `test:e2e` picks it up; it
 * creates real AWS infrastructure and must only be run by hand. Drives a *subset* of the aws-ecs-server module graph so
 * bugs surface without paying for the NAT gateway / ALB creation+deletion latency of the full e2e.
 *
 * State lives on disk (LocalStateProvider), so apply and teardown are separate processes and the
 * live resources can be inspected with the AWS CLI in between.
 *
 *   OCTO_STAGE=region OCTO_PHASE=apply    jest --testRegex "incremental\.e2e-harness\.ts$"
 *   aws ec2 describe-vpcs ...                       # inspect
 *   OCTO_STAGE=region OCTO_PHASE=teardown jest --testRegex "incremental\.e2e-harness\.ts$"
 *
 * OCTO_NAT=on re-enables the NAT gateway (slow); default is off.
 */
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { jest } from '@jest/globals';
import { LocalStateProvider, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { HtmlReportEventListener } from '@quadnix/octo-event-listeners/html-report';
import { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import { config } from './app.config.js';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';
const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-ecs-server' };

const STAGE = process.env.OCTO_STAGE ?? 'region';
const PHASE = process.env.OCTO_PHASE ?? 'apply';
const NAT = process.env.OCTO_NAT === 'on';
const TARGET = (process.env.OCTO_TARGET ?? 'apply') as 'apply' | 'plan';

// One shared work dir by default, so successive stages *grow* the same stack (which also exercises
// the re-apply path). Set OCTO_WORK to isolate a stage on its own state.
const workDir = join(__dirname, '.octo-incremental', process.env.OCTO_WORK ?? 'hunt');
const stateDir = join(workDir, 'state');
const outputDir = join(workDir, 'generated');

/**
 * Cumulative module sets, cheapest first. Each stage is a superset of the previous one.
 */
const REGION = ['app-module', 'account-module', 'region-module'];
const SUBNETS = [...REGION, 'public-subnet-module', 'public-backup-subnet-module', 'private-subnet-module'];
const SERVER = [...SUBNETS, 'backend-server-module', 'backend-deployment-v1-module', 'qa-environment-module'];
const EXECUTION = [...SERVER, 'backend-v1-qa-execution-module'];
const ALB = [...EXECUTION, 'qa-api-alb-module'];

const STAGES: { [stage: string]: string[] } = {
  alb: ALB,
  execution: EXECUTION,
  full: ALB,
  region: REGION,
  server: SERVER,
  subnets: SUBNETS,
};

/**
 * Teardown mirrors the real e2e: keep only app + account, which owns no cloud resources.
 */
const TEARDOWN_MODULES = ['app-module', 'account-module'];

jest.setTimeout(1_800_000);

describe(`Incremental E2E [stage=${STAGE} phase=${PHASE} nat=${NAT ? 'on' : 'off'}]`, () => {
  let moduleDefinitions: ModuleDefinitions;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });

    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize(
      new LocalStateProvider(stateDir),
      [
      { options: { args: [{ level: 'info' }] }, type: LoggingEventListener },
      { options: { args: [{ reportDir: join(workDir, 'reports') }] }, type: HtmlReportEventListener },
    ],
    );

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

  it(`should run stage`, async () => {
    const keep = PHASE === 'teardown' ? TEARDOWN_MODULES : STAGES[STAGE];
    if (!keep) {
      throw new Error(`Unknown stage "${STAGE}". Known: ${Object.keys(STAGES).join(', ')}`);
    }

    for (const moduleId of moduleDefinitions.getAll().map((md) => md.moduleId)) {
      if (!keep.includes(moduleId)) {
        moduleDefinitions.remove(moduleId);
      }
    }

    // The NAT gateway is the slowest resource in the graph (~2 min up, ~2 min down). Off by default:
    // nothing below the execution layer needs egress to be *verified*, only to be *wired*.
    const overrides: { [moduleId: string]: (inputs: any) => any } = NAT
      ? {}
      : {
          'private-subnet-module': (i) => ({
            ...i,
            subnetSiblings: (i.subnetSiblings ?? []).map((s: any) => ({ ...s, attachToNatGateway: false })),
          }),
          'public-subnet-module': (i) => ({
            ...i,
            subnetOptions: { ...i.subnetOptions, createNatGateway: false },
          }),
        };

    const modules = moduleDefinitions.getAll().map((md) => ({
      inputs: overrides[md.moduleId] ? overrides[md.moduleId](md.moduleInputs) : md.moduleInputs,
      moduleId: md.moduleId,
      type: md.module,
    }));

    const { resourceDiffs, responses, validateReport } = (
      await testModuleContainer.runModules(modules, { outputDir, terraformTarget: TARGET }).next()
    ).value!;

    console.log('=== RESOURCE DIFFS ===\n' + testModuleContainer.digestDiffs(resourceDiffs).join('\n'));
    // Printed as the report's own data rather than rendered prose: the renderer lives in octo-build,
    // which this package does not depend on, and the raw report is what a harness wants anyway.
    if (validateReport) {
      console.log('=== VALIDATE REPORT ===\n' + JSON.stringify(validateReport, null, 2));
    }

    console.log('=== RESPONSES ===\n' + JSON.stringify(responses, null, 2));
  });
});
