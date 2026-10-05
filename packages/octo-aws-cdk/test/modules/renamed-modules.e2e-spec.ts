import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Container, TerraformUtility, TestContainer, type TestModule, type TestModuleContainer } from '@quadnix/octo';
import {
  type AnyModule,
  ECS_US_EAST_1,
  appModules,
  createStackTestModuleContainer,
  ecsDeploymentModule,
  ecsEnvironmentModule,
  ecsExecutionModule,
  ecsPrivateSubnetModule,
  ecsRegionModules,
  serverModule,
} from '../utilities/stack.utility.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated', 'renamed-modules');

/**
 * The modules with `fromModuleId` renamed to `toModuleId`, and every reference to it pointed at the new id.
 */
function renameModule(
  modules: TestModule<AnyModule>[],
  fromModuleId: string,
  toModuleId: string,
): TestModule<AnyModule>[] {
  return modules.map((module) => ({
    ...module,
    inputs: JSON.parse(JSON.stringify(module.inputs).replaceAll(`\${{${fromModuleId}.`, `\${{${toModuleId}.`)),
    moduleId: module.moduleId === fromModuleId ? toModuleId : module.moduleId,
  }));
}

/*
 * A stack applied, then applied again with one region's module and one execution's module renamed.
 * Each renamed module's terraform state moves into its new folder, so terraform destroys nothing.
 * This e2e applies real infrastructure, and destroys it at the end.
 */
describe('Renamed modules E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    testModuleContainer = await createStackTestModuleContainer(['us-east-1'], OUTPUT_DIR);
  });

  afterEach(async () => {
    const terraformUtility = await Container.getInstance().get(TerraformUtility);
    await terraformUtility.destroy(OUTPUT_DIR);

    await testModuleContainer.reset();
    await TestContainer.reset();
  }, 1_800_000);

  it('should keep every resource when a region module and an execution module are renamed', async () => {
    const { name } = ECS_US_EAST_1;
    const modules = [
      ...appModules('renamed-modules'),
      ...ecsRegionModules(ECS_US_EAST_1),
      ecsPrivateSubnetModule(ECS_US_EAST_1),
      ecsEnvironmentModule(name, 'qa'),
      serverModule('backend'),
      ecsDeploymentModule('backend', 'v1'),
      ecsExecutionModule({
        deployment: 'backend-v1',
        environment: 'qa',
        executionId: 'backend-v1-qa',
        regionName: name,
        subnet: 'private',
      }),
    ];

    const { responses: firstResponses } = (
      await testModuleContainer.runModules(modules, { outputDir: OUTPUT_DIR, terraformTarget: 'apply' }).next()
    ).value!;

    await testModuleContainer.reset();
    const renamedModules = renameModule(
      renameModule(modules, `region-${name}`, `region-${name}-renamed`),
      `execution-backend-v1-qa-${name}`,
      `execution-backend-v1-qa-${name}-renamed`,
    );
    const { responses: secondResponses, validateReport } = (
      await testModuleContainer.runModules(renamedModules, { outputDir: OUTPUT_DIR, terraformTarget: 'apply' }).next()
    ).value!;

    // Both folders' resources moved, and nothing was planned for destruction.
    expect(
      [...new Set(validateReport!.moves.map((move) => `${move.fromModuleId} -> ${move.moduleId}`))].sort(),
    ).toEqual([
      `execution-backend-v1-qa-${name} -> execution-backend-v1-qa-${name}-renamed`,
      `region-${name} -> region-${name}-renamed`,
    ]);
    const plannedActions = [
      ...validateReport!.intentChanges.flatMap((change) => change.terraformChanges),
      ...validateReport!.attributedChanges,
      ...validateReport!.drift,
      ...validateReport!.uncertain,
    ].flatMap((change) => change.tfActions);
    expect(plannedActions).not.toContain('delete');

    // Every resource id is unchanged.
    expect(Object.keys(secondResponses).sort()).toEqual(Object.keys(firstResponses).sort());
  }, 3_600_000);
});
