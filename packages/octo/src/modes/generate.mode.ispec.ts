import { jest } from '@jest/globals';
import type { UnknownResource } from '../app.type.js';
import { Resource } from '../decorators/resource.decorator.js';
import { TerraformProcessOutputEvent } from '../events/index.js';
import { Container } from '../functions/container/container.js';
import type { App } from '../models/app/app.model.js';
import { BaseResourceSchema } from '../resources/resource.schema.js';
import { ATerraformResource } from '../resources/terraform-resource.abstract.js';
import { EventService } from '../services/event/event.service.js';
import { InputService } from '../services/input/input.service.js';
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
      input: `${this.properties['name']}:${this.properties['note'] ?? ''}`,
      triggers_replace: this.properties['version'],
    });
    namedTf.output({ Id: terraform.raw(`terraform_data.${this.resourceId}.id`) });
  }
}
Resource<NamedDataResource>('@octo', 'test-named-data-resource', BaseResourceSchema, {
  uniqueProperties: [{ path: 'name', within: [] }],
})(NamedDataResource);

/**
 * A resource reading the id of its parent, so a parent in another folder reaches it through a
 * terragrunt dependency.
 */
class ConsumerDataResource extends ATerraformResource<BaseResourceSchema, ConsumerDataResource> {
  constructor(resourceId: string, properties: BaseResourceSchema['properties'], parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const consumerTf = terraform.addOctoTerraformResource(this as ConsumerDataResource);
    consumerTf.addTerraformResource('terraform_data', this.resourceId, {
      input: terraform.getRef(this.parents[0] as UnknownResource, 'Id' as never),
    });
  }
}
Resource<ConsumerDataResource>('@octo', 'test-consumer-data-resource', BaseResourceSchema)(ConsumerDataResource);

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
    // Read what the apply printed from its output events, the one channel terraform output goes out on.
    const emit = jest.spyOn(EventService.getInstance(), 'emit');
    await terraformUtility.apply(testModes.outputDir);
    const applyLog = emit.mock.calls
      .map(([event]) => event)
      .filter((event): event is TerraformProcessOutputEvent => event instanceof TerraformProcessOutputEvent)
      .map((event) => event.payload.text)
      .join('');
    emit.mockRestore();
    const outputs = (await terraformUtility.output(testModes.outputDir, { json: true })) as Parameters<
      TestModes['commit']
    >[1]['outputs'];
    await testModes.commit(app, { outputs });

    return {
      applyLog,
      ids: Object.fromEntries(
        [...outputs.values()].flatMap((moduleOutputs) =>
          Object.entries(moduleOutputs).map(([name, { value }]) => [name, value]),
        ),
      ),
    };
  }

  /**
   * Hands a resource to another module, as renaming its module or moving it between modules does.
   */
  async function moveResource(fromModuleId: string, toModuleId: string, resource: UnknownResource): Promise<void> {
    const inputService = await Container.getInstance().get(InputService);
    delete inputService['resources'][`${fromModuleId}.resource.${resource.localResourceId}`];
    if (testModes.resourceDataRepository.getNewResourceByContext(resource.getContext())) {
      inputService.registerResource(toModuleId, resource);
    } else {
      await testModes.addResource(toModuleId, resource);
    }
  }

  async function createApp(resources: [string, NamedDataResource][]): Promise<App> {
    const {
      app: [app],
    } = await testModes['testModuleContainer'].createTestModels('app-module', { app: ['test-app'] });
    for (const [moduleId, resource] of resources) {
      await testModes.addResource(moduleId, resource);
    }
    return app as App;
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

  it('should keep the infrastructure of a resource moving to another module folder', async () => {
    const app = await createApp([['module-1', new NamedDataResource('named-1', { name: 'accounts', version: '1' })]]);
    const { ids: firstIds } = await applyAndCommit(app);

    await moveResource('module-1', 'module-2', new NamedDataResource('named-1', { name: 'accounts', version: '1' }));
    await testModes.generate(app, { outputDir: testModes.outputDir });
    const { plans } = await terraformUtility.plan(testModes.outputDir, { json: true });
    expect(terraformUtility.findPlannedDestroys(plans)).toEqual([]);

    const { applyLog, ids: secondIds } = await applyAndCommit(app);
    expect(applyLog).not.toContain('Creating...');
    expect(applyLog).not.toContain('Destroying...');
    expect(secondIds['named-1-Id']).toBe(firstIds['named-1-Id']);
  }, 120_000);

  it('should keep the infrastructure of two module folders swapping their resources', async () => {
    const app = await createApp([
      ['module-1', new NamedDataResource('named-1', { name: 'accounts', version: '1' })],
      ['module-2', new NamedDataResource('named-2', { name: 'orders', version: '1' })],
    ]);
    const { ids: firstIds } = await applyAndCommit(app);

    await moveResource('module-1', 'module-2', new NamedDataResource('named-1', { name: 'accounts', version: '1' }));
    await moveResource('module-2', 'module-1', new NamedDataResource('named-2', { name: 'orders', version: '1' }));
    const { applyLog, ids: secondIds } = await applyAndCommit(app);

    expect(applyLog).not.toContain('Creating...');
    expect(applyLog).not.toContain('Destroying...');
    expect(secondIds).toEqual(firstIds);
  }, 120_000);

  it('should update in place a resource renamed into another module folder with a property changed', async () => {
    const app = await createApp([
      ['module-1', new NamedDataResource('named-1', { name: 'accounts', note: 'a', version: '1' })],
    ]);
    const { ids: firstIds } = await applyAndCommit(app);

    await testModes.addResource(
      'module-2',
      new NamedDataResource('named-2', { name: 'accounts', note: 'b', version: '1' }),
    );
    const { applyLog, ids: secondIds } = await applyAndCommit(app);

    expect(applyLog).toContain('0 added, 1 changed, 0 destroyed');
    expect(applyLog).not.toContain('Creating...');
    expect(secondIds['named-2-Id']).toBe(firstIds['named-1-Id']);
  }, 120_000);

  it('should plan on the moved state without checking it in, so an undone move moves nothing', async () => {
    const app = await createApp([['module-1', new NamedDataResource('named-1', { name: 'accounts', version: '1' })]]);
    await applyAndCommit(app);
    const committedState = await testModes['stateManagementService'].getState('module-1.tfstate');

    const named1 = new NamedDataResource('named-1', { name: 'accounts', version: '1' });
    await moveResource('module-1', 'module-2', named1);
    await testModes.generate(app, { outputDir: testModes.outputDir });
    const { plans: movedPlans } = await terraformUtility.plan(testModes.outputDir, { json: true });
    expect(movedPlans.get('module-2')!.resource_changes!.map((c) => c.change!.actions)).toEqual([['no-op']]);
    expect(await testModes['stateManagementService'].getState('module-1.tfstate')).toEqual(committedState);

    await moveResource('module-2', 'module-1', named1);
    await testModes.generate(app, { outputDir: testModes.outputDir });
    const { plans } = await terraformUtility.plan(testModes.outputDir, { json: true });
    expect(plans.get('module-1')!.resource_changes!.map((c) => c.change!.actions)).toEqual([['no-op']]);
  }, 120_000);

  it('should keep a folder depending on a moved resource reading its real output', async () => {
    const named1 = new NamedDataResource('named-1', { name: 'accounts', version: '1' });
    const app = await createApp([
      ['producer', named1],
      ['consumer', new ConsumerDataResource('consumer-1', {}, [named1])],
    ]);
    await applyAndCommit(app);

    await moveResource(
      'producer',
      'producer-renamed',
      new NamedDataResource('named-1', { name: 'accounts', version: '1' }),
    );
    testModes.resourceDataRepository.addNewResource(
      new ConsumerDataResource('consumer-1', {}, [
        testModes.resourceDataRepository.getNewResourceByContext(named1.getContext())!,
      ]),
    );
    await testModes.generate(app, { outputDir: testModes.outputDir });
    const { plans } = await terraformUtility.plan(testModes.outputDir, { json: true });

    expect(plans.get('consumer')!.resource_changes!.map((c) => c.change!.actions)).toEqual([['no-op']]);
  }, 120_000);
});
