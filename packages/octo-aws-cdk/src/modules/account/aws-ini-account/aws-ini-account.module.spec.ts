import { type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { AwsIniAccountModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App }> {
  const {
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
  return { app };
}

describe('AwsIniAccountModule UT', () => {
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
    const runModulesGenerator = testModuleContainer.runModules<AwsIniAccountModule>(
      app,
      {
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      },
      { filterByModuleIds: ['account'], terraformTarget: 'skip' },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclRender).toMatchInlineSnapshot(`""`);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsIniAccountModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsIniAccountModule>(
        appCreate,
        {
          inputs: {
            accountId: '123',
            app: stub('${{testModule.model.app}}'),
          },
          moduleId: 'account',
          type: AwsIniAccountModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    const { app: appDelete } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsIniAccountModule>(
          appDelete,
          {
            hidden: true,
            inputs: {
              accountId: '123',
              app: stub('${{testModule.model.app}}'),
            },
            moduleId: 'account',
            type: AwsIniAccountModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsIniAccountModule>(
        appCreate,
        {
          inputs: {
            accountId: '123',
            app: stub('${{testModule.model.app}}'),
          },
          moduleId: 'account',
          type: AwsIniAccountModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsIniAccountModule>(
          appUpdateTags,
          {
            inputs: {
              accountId: '123',
              app: stub('${{testModule.model.app}}'),
            },
            moduleId: 'account',
            type: AwsIniAccountModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsIniAccountModule>(
          appDeleteTags,
          {
            inputs: {
              accountId: '123',
              app: stub('${{testModule.model.app}}'),
            },
            moduleId: 'account',
            type: AwsIniAccountModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('input changes', () => {
    it('should handle accountId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsIniAccountModule>(
          appCreate,
          {
            inputs: {
              accountId: '123',
              app: stub('${{testModule.model.app}}'),
            },
            moduleId: 'account',
            type: AwsIniAccountModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdate } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsIniAccountModule>(
            appUpdate,
            {
              inputs: {
                accountId: '456',
                app: stub('${{testModule.model.app}}'),
              },
              moduleId: 'account',
              type: AwsIniAccountModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });

    it('should handle iniProfile change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsIniAccountModule>(
          appCreate,
          {
            inputs: {
              accountId: '123',
              app: stub('${{testModule.model.app}}'),
              iniProfile: 'default',
            },
            moduleId: 'account',
            type: AwsIniAccountModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdate } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsIniAccountModule>(
            appUpdate,
            {
              inputs: {
                accountId: '123',
                app: stub('${{testModule.model.app}}'),
                iniProfile: 'production',
              },
              moduleId: 'account',
              type: AwsIniAccountModule,
            },
            { terraformTarget: 'skip' },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });

    it('should handle endpoints change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsIniAccountModule>(
          appCreate,
          {
            inputs: {
              accountId: '123',
              app: stub('${{testModule.model.app}}'),
              endpoints: {},
            },
            moduleId: 'account',
            type: AwsIniAccountModule,
          },
          { terraformTarget: 'skip' },
        )
        .next();

      const { app: appUpdate } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsIniAccountModule>(
            appUpdate,
            {
              inputs: {
                accountId: '123',
                app: stub('${{testModule.model.app}}'),
                endpoints: { s3: 'http://localhost:4566' },
              },
              moduleId: 'account',
              type: AwsIniAccountModule,
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
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsIniAccountModule>(
        appCreate,
        {
          inputs: {
            accountId: '123',
            app: stub('${{testModule.model.app}}'),
          },
          moduleId: 'account-1',
          type: AwsIniAccountModule,
        },
        { terraformTarget: 'skip' },
      )
      .next();

    const { app: appUpdate } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsIniAccountModule>(
          appUpdate,
          {
            inputs: {
              accountId: '123',
              app: stub('${{testModule.model.app}}'),
            },
            moduleId: 'account-2',
            type: AwsIniAccountModule,
          },
          { terraformTarget: 'skip' },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate accountId is not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsIniAccountModule>(
            app,
            {
              inputs: {
                accountId: '',
                app: stub('${{testModule.model.app}}'),
              },
              moduleId: 'account',
              type: AwsIniAccountModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "accountId" in schema could not be validated!"`);
    });

    it('should validate iniProfile is not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsIniAccountModule>(
            app,
            {
              inputs: {
                accountId: '123',
                app: stub('${{testModule.model.app}}'),
                iniProfile: '',
              },
              moduleId: 'account',
              type: AwsIniAccountModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "iniProfile" in schema could not be validated!"`);
    });

    it('should validate endpoints values are not empty', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsIniAccountModule>(
            app,
            {
              inputs: {
                accountId: '123',
                app: stub('${{testModule.model.app}}'),
                endpoints: { s3: '' },
              },
              moduleId: 'account',
              type: AwsIniAccountModule,
            },
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "endpoints" in schema could not be validated!"`);
    });
  });
});
