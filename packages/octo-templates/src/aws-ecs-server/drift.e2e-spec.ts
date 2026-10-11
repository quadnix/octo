/**
 * Covers infrastructure changed **outside octo**, with intent left alone — the one case no other e2e
 * exercises, since every other one changes an input and asks what octo does about it.
 *
 * Built on the region + subnet layers only, with the NAT gateway off, so the whole spec runs in a
 * couple of minutes where the full stack takes twenty.
 */
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DisassociateRouteTableCommand, EC2Client } from '@aws-sdk/client-ec2';
import { jest } from '@jest/globals';
import { TestContainer, TestModuleContainer, TestStateProvider } from '@quadnix/octo';
import { LoggingEventListener } from '@quadnix/octo-event-listeners/logging';
import { AwsLiveResourcesUtility } from '../utilities/aws/live-resources/aws-live-resources.utility.js';
import { AwsTagsUtility } from '../utilities/aws/tags/aws-tags.utility.js';
import { config } from './app.config.js';
import { ModuleDefinitions } from './module-definitions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AWS_REGION_ID = 'us-east-1';

const outputDir = join(__dirname, '.octo-drift', 'generated');

// A family of its own, so this spec's teardown assertion can never be confused by main e2e leftovers.
const E2E_TAGS = { 'e2e-test': 'true', 'e2e-test-family': 'aws-ecs-server-drift' };

/**
 * Region + subnets. Enough to own a real, cheap, quickly-created resource to break by hand.
 */
const STACK_MODULES = [
  'app-module',
  'account-module',
  'region-module',
  'public-subnet-module',
  'public-backup-subnet-module',
  'private-subnet-module',
];
const TEARDOWN_MODULES = ['app-module', 'account-module'];

// The resource id in the address ends in a hash of its scope.
const DRIFTED_ADDRESS = /^aws_route_table_association\.rt-app-region-east-public-subnet-[0-9a-f]+_assoc$/;

jest.setTimeout(1_800_000);

describe('Drift E2E', () => {
  let moduleDefinitions: ModuleDefinitions;
  let stateProvider: TestStateProvider;
  let subnetAssociationId: string;
  let testModuleContainer: TestModuleContainer;

  beforeAll(() => {
    stateProvider = new TestStateProvider();
  });

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize(stateProvider, [
      { options: { args: [{ level: 'info' }] }, type: LoggingEventListener },
    ]);

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

  /**
   * Keeps `keep`, drops the rest, and turns the NAT gateway off — it is the slowest resource in the
   * graph by far (~2 min up, ~2 min down) and nothing here needs egress to be verified, only wired.
   */
  const buildModules = (keep: string[]): { inputs: any; moduleId: string; type: any }[] => {
    for (const moduleId of moduleDefinitions.getAll().map((md) => md.moduleId)) {
      if (!keep.includes(moduleId)) {
        moduleDefinitions.remove(moduleId);
      }
    }

    const overrides: { [moduleId: string]: (inputs: any) => any } = {
      'private-subnet-module': (i) => ({
        ...i,
        subnetSiblings: (i.subnetSiblings ?? []).map((s: any) => ({ ...s, attachToNatGateway: false })),
      }),
      'public-subnet-module': (i) => ({ ...i, subnetOptions: { ...i.subnetOptions, createNatGateway: false } }),
    };

    return moduleDefinitions.getAll().map((md) => ({
      inputs: overrides[md.moduleId] ? overrides[md.moduleId](md.moduleInputs) : md.moduleInputs,
      moduleId: md.moduleId,
      type: md.module,
    }));
  };

  it('should apply the stack', async () => {
    const { responses } = (
      await testModuleContainer.runModules(buildModules(STACK_MODULES), { outputDir, terraformTarget: 'apply' }).next()
    ).value!;

    // A resource id ends in a hash of its scope, so the route table is found by the id's readable part.
    const routeTable = Object.entries(responses).find(([context]) =>
      context.startsWith('@octo/route-table=rt-app-region-east-public-subnet-'),
    )?.[1] as { subnetAssociationId: string };
    expect(routeTable.subnetAssociationId).toBeDefined();
    subnetAssociationId = routeTable.subnetAssociationId;
  });

  it('should report a resource deleted outside octo as drift', async () => {
    // Break the stack the way a human with console access would. A route table association is
    // instant to break and repair, and is one address of a two-address octo resource, so it also
    // exercises sub-resource attribution.
    await new EC2Client({ region: AWS_REGION_ID }).send(
      new DisassociateRouteTableCommand({ AssociationId: subnetAssociationId }),
    );

    const { resourceDiffs, validateReport } = (
      await testModuleContainer.runModules(buildModules(STACK_MODULES), { outputDir, terraformTarget: 'plan' }).next()
    ).value!;

    // Intent is untouched, so octo has nothing to say and nothing can be attributed to it.
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toEqual([]);
    expect(validateReport!.failures).toEqual([]);
    expect(validateReport!.intentChanges).toEqual([]);
    expect(validateReport!.attributedChanges).toEqual([]);
    // Intent did not move, so nothing was mocked and no cross-folder output moved. The report must
    // say so, since this is the only regime in which a drift claim can be believed.
    expect(validateReport!.confidence).toBe('exact');
    expect(validateReport!.uncertain).toEqual([]);
    expect(validateReport!.drift).toEqual([
      { address: expect.stringMatching(DRIFTED_ADDRESS), moduleId: 'public-subnet-module', tfActions: ['create'] },
    ]);
  });

  it('should repair the drift on the next apply', async () => {
    await testModuleContainer.runModules(buildModules(STACK_MODULES), { outputDir, terraformTarget: 'apply' }).next();
  });

  it('should stop reporting drift once it is repaired', async () => {
    // A drift report that cannot be cleared is indistinguishable from one that is simply wrong.
    const { validateReport } = (
      await testModuleContainer.runModules(buildModules(STACK_MODULES), { outputDir, terraformTarget: 'plan' }).next()
    ).value!;

    expect(validateReport!.failures).toEqual([]);
    expect(validateReport!.drift).toEqual([]);
    expect(validateReport!.uncertain).toEqual([]);
  });

  it('should have no resources left after teardown', async () => {
    await testModuleContainer
      .runModules(buildModules(TEARDOWN_MODULES), { outputDir, terraformTarget: 'apply' })
      .next();

    // Assert on what is still live, not on what is still tagged: the tagging API keeps returning
    // subnets that `DescribeSubnets` already answers `InvalidSubnetID.NotFound` for.
    const taggedArns = await new AwsTagsUtility(AWS_REGION_ID).getResourceArnsByTags(E2E_TAGS);
    expect(await new AwsLiveResourcesUtility(AWS_REGION_ID).filterLiveArns(taggedArns)).toEqual([]);
  });
});
