import { TestContainer, TestModuleContainer } from '@quadnix/octo';
import { SimpleAppModule } from './index.js';

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
    const runModulesGenerator = testModuleContainer.runModules<SimpleAppModule>(
      {
        inputs: { name: 'test-app' },
        moduleId: 'app',
        type: SimpleAppModule,
      },
      { filterByModuleIds: ['app'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclRender).toMatchInlineSnapshot(`""`);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
      [
        [
          "AddSimpleAppModelAction",
        ],
      ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`[]`);

    // The module under test is hidden below, so nothing produces the root app - seed a test double.
    await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
    const { hclDiff, resourceDiffs: resourceDiffsDelete } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          {
            hidden: true,
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { terraformTarget: 'skip' },
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
    const { resourceDiffs: resourceDiffsCreate } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(testModuleContainer.digestDiffs(resourceDiffsCreate)).toMatchInlineSnapshot(`[]`);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { hclDiff: hclDiffUpdateTags, resourceDiffs: resourceDiffsUpdateTags } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiffUpdateTags).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffsUpdateTags)).toMatchInlineSnapshot(`[]`);

    const { hclDiff: hclDiffDeleteTags, resourceDiffs: resourceDiffsDeleteTags } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiffDeleteTags).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffsDeleteTags)).toMatchInlineSnapshot(`[]`);
  });

  describe('input changes', () => {
    it('should handle name change', async () => {
      await testModuleContainer
        .runModules<SimpleAppModule>(
          {
            inputs: { name: 'test-app' },
            moduleId: 'app',
            type: SimpleAppModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<SimpleAppModule>(
            {
              inputs: { name: 'changed-app' },
              moduleId: 'app',
              type: SimpleAppModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });
  });

  it('should handle moduleId change', async () => {
    await testModuleContainer
      .runModules<SimpleAppModule>(
        {
          inputs: { name: 'test-app' },
          moduleId: 'app-1',
          type: SimpleAppModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<SimpleAppModule>(
          {
            inputs: { name: 'test-app' },
            moduleId: 'app-2',
            type: SimpleAppModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate name length', async () => {
      await expect(
        testModuleContainer
          .runModules<SimpleAppModule>(
            {
              inputs: { name: '' },
              moduleId: 'app',
              type: SimpleAppModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "name" in schema could not be validated!"`);
    });
  });
});
