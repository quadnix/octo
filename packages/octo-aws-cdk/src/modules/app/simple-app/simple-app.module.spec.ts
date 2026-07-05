import { type App, TestContainer, TestModuleContainer } from '@quadnix/octo';
import { SimpleAppModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App }> {
  const {
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
  return { app };
}

describe('SimpleAppModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    const runModulesGenerator = testModuleContainer.runModules<SimpleAppModule>(
      app,
      {
        inputs: { name: 'test-app' },
        moduleId: 'app',
        type: SimpleAppModule,
      },
      { filterByModuleIds: ['app'], skipTerraformApply: true },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclRender).toMatchInlineSnapshot(`""`);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`[]`);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          appCreate,
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`[]`);

    const { app: appDelete } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs: resourceDiffsDelete } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          appDelete,
          {
            hidden: true,
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffsDelete)).toMatchInlineSnapshot(`[]`);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          appCreate,
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`[]`);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const { hclDiff: hclDiffUpdateTags, resourceDiffs: resourceDiffsUpdateTags } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          appUpdateTags,
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(hclDiffUpdateTags).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffsUpdateTags)).toMatchInlineSnapshot(`[]`);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const { hclDiff: hclDiffDeleteTags, resourceDiffs: resourceDiffsDeleteTags } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          appDeleteTags,
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(hclDiffDeleteTags).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffsDeleteTags)).toMatchInlineSnapshot(`[]`);
  });

  describe('input changes', () => {
    it('should handle name change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<SimpleAppModule>(
          appCreate,
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appUpdateName } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<SimpleAppModule>(
            appUpdateName,
            {
              inputs: { name: 'changed-app' },
              moduleId: 'app',
              type: SimpleAppModule,
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<SimpleAppModule>(
        appCreate,
        {
          inputs: { name: 'test-app' },
          moduleId: 'app-1',
          type: SimpleAppModule,
        },
        { skipTerraformApply: true },
      )
      .next();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          appUpdateModuleId,
          {
            inputs: { name: 'test-app' },
            moduleId: 'app-2',
            type: SimpleAppModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate name length', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<SimpleAppModule>(
            app,
            {
              inputs: { name: '' },
              moduleId: 'app',
              type: SimpleAppModule,
            },
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "name" in schema could not be validated!"`);
    });
  });
});
