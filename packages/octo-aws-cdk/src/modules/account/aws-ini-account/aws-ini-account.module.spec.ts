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
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });

    // The account module creates no resources, so it renders no terraform.
    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`""`);

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['account'] });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsIniAccountModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    await testModuleContainer.commit(appCreate);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    await testModuleContainer.commit(appCreate);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`[]`);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('input changes', () => {
    it('should handle accountId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '456',
          app: stub('${{testModule.model.app}}'),
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdate)).toMatchSnapshot();
      const resultUpdate = await testModuleContainer.commit(appUpdate);
      expect(testModuleContainer.digestDiffs(resultUpdate.resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });

    it('should handle iniProfile change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
          iniProfile: 'default',
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
          iniProfile: 'production',
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdate)).toMatchSnapshot();
      const resultUpdate = await testModuleContainer.commit(appUpdate);
      expect(testModuleContainer.digestDiffs(resultUpdate.resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });

    it('should handle endpoints change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
          endpoints: {},
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      await testModuleContainer.commit(appCreate);

      const { app: appUpdate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsIniAccountModule>({
        inputs: {
          accountId: '123',
          app: stub('${{testModule.model.app}}'),
          endpoints: { s3: 'http://localhost:4566' },
        },
        moduleId: 'account',
        type: AwsIniAccountModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdate)).toMatchSnapshot();
      const resultUpdate = await testModuleContainer.commit(appUpdate);
      expect(testModuleContainer.digestDiffs(resultUpdate.resourceDiffs)).toMatchInlineSnapshot(`[]`);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account-1',
      type: AwsIniAccountModule,
    });
    await testModuleContainer.commit(appCreate);

    const { app: appUpdate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account-2',
      type: AwsIniAccountModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdate)).toMatchSnapshot();
    const resultUpdate = await testModuleContainer.commit(appUpdate);
    expect(testModuleContainer.digestDiffs(resultUpdate.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate accountId is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsIniAccountModule>({
          inputs: {
            accountId: '',
            app: stub('${{testModule.model.app}}'),
          },
          moduleId: 'account',
          type: AwsIniAccountModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "accountId" in schema could not be validated!"`);
    });

    it('should validate iniProfile is not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsIniAccountModule>({
          inputs: {
            accountId: '123',
            app: stub('${{testModule.model.app}}'),
            iniProfile: '',
          },
          moduleId: 'account',
          type: AwsIniAccountModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "iniProfile" in schema could not be validated!"`);
    });

    it('should validate endpoints values are not empty', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsIniAccountModule>({
          inputs: {
            accountId: '123',
            app: stub('${{testModule.model.app}}'),
            endpoints: { s3: '' },
          },
          moduleId: 'account',
          type: AwsIniAccountModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Property "endpoints" in schema could not be validated!"`);
    });
  });
});
