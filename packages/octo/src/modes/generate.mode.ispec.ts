import type { UnknownResource } from '../app.type.js';
import { Resource } from '../decorators/resource.decorator.js';
import { Container } from '../functions/container/container.js';
import type { App } from '../models/app/app.model.js';
import { BaseResourceSchema } from '../resources/resource.schema.js';
import { ATerraformResource } from '../resources/terraform-resource.abstract.js';
import type { TerraformModuleScope } from '../services/terraform/terraform.service.js';
import { TerraformUtility } from '../utilities/terraform/terraform.utility.js';
import { TestModes } from '../utilities/test-helpers/test-modes.js';

/**
 * A resource holding a name its provider keeps unique, rendered as a `terraform_data` whose id
 * terraform draws at random on every create: an id that survives an apply is infrastructure kept.
 */
class NamedDataResource extends ATerraformResource<BaseResourceSchema, NamedDataResource> {
  constructor(resourceId: string, properties: BaseResourceSchema['properties'], parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const namedTf = terraform.addOctoTerraformResource(this as NamedDataResource);
    namedTf.addTerraformResource('terraform_data', this.resourceId, {
      input: this.properties['name'],
      triggers_replace: this.properties['version'],
    });
    namedTf.output({ Id: terraform.raw(`terraform_data.${this.resourceId}.id`) });
  }
}
Resource<NamedDataResource>('@octo', 'test-named-data-resource', BaseResourceSchema, {
  uniqueProperties: [{ path: 'name', within: [] }],
})(NamedDataResource);

describe('generate() IT', () => {
  let terraformUtility: TerraformUtility;
  let testModes: TestModes;

  beforeEach(async () => {
    testModes = await TestModes.create();
    terraformUtility = await Container.getInstance().get(TerraformUtility);
  });

  afterEach(async () => {
    await testModes.teardown();
  });

  async function applyAndCommit(app: App): Promise<{ applyLog: string; ids: Record<string, unknown> }> {
    await testModes.generate(app, { outputDir: testModes.outputDir });
    const { stderr, stdout } = await terraformUtility.apply(testModes.outputDir);
    const outputs = (await terraformUtility.output(testModes.outputDir, { json: true })) as Parameters<
      TestModes['commit']
    >[1]['outputs'];
    await testModes.commit(app, { outputs });

    return {
      applyLog: stdout + stderr,
      ids: Object.fromEntries(Object.entries(outputs.get('module-1') ?? {}).map(([name, { value }]) => [name, value])),
    };
  }

  it('should keep the infrastructure of a resource whose id changes but whose name stays', async () => {
    const {
      app: [app],
    } = await testModes['testModuleContainer'].createTestModels('app-module', { app: ['test-app'] });
    await testModes.addResource('module-1', new NamedDataResource('named-1', { name: 'accounts', version: '1' }));
    const { ids: firstIds } = await applyAndCommit(app as App);

    await testModes.addResource('module-1', new NamedDataResource('named-2', { name: 'accounts', version: '1' }));
    const { applyLog, ids: secondIds } = await applyAndCommit(app as App);

    expect(applyLog).toContain('0 added, 0 changed, 0 destroyed');
    expect(secondIds['named-2-Id']).toBe(firstIds['named-1-Id']);
  }, 120_000);

  it('should destroy the old infrastructure before creating the new when the move also replaces it', async () => {
    const {
      app: [app],
    } = await testModes['testModuleContainer'].createTestModels('app-module', { app: ['test-app'] });
    await testModes.addResource('module-1', new NamedDataResource('named-1', { name: 'accounts', version: '1' }));
    const { ids: firstIds } = await applyAndCommit(app as App);

    await testModes.addResource('module-1', new NamedDataResource('named-2', { name: 'accounts', version: '2' }));
    const { applyLog, ids: secondIds } = await applyAndCommit(app as App);

    expect(applyLog).toContain('1 added, 0 changed, 1 destroyed');
    expect(applyLog.indexOf('terraform_data.named-2: Destruction complete')).toBeGreaterThan(-1);
    expect(applyLog.indexOf('terraform_data.named-2: Destruction complete')).toBeLessThan(
      applyLog.indexOf('terraform_data.named-2: Creating...'),
    );
    expect(secondIds['named-2-Id']).not.toBe(firstIds['named-1-Id']);
  }, 120_000);
});
