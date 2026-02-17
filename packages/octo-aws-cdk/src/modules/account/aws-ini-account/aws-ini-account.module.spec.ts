import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { type App, type Container, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { mockClient } from 'aws-sdk-client-mock';
import { AwsIniAccountModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ app: App }> {
  const {
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { app: ['test-app'] });
  return { app };
}

describe('AwsIniAccountModule UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  const STSClientMock = mockClient(STSClient);
  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);

  beforeEach(async () => {
    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    STSClientMock.on(GetCallerIdentityCommand).resolves({ Account: '123' });

    container = await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: ResourceGroupsTaggingAPIClient,
            value: ResourceGroupsTaggingAPIClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: STSClient,
            value: STSClientMock,
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();
  });

  afterEach(async () => {
    ResourceGroupsTaggingAPIClientMock.restore();
    STSClientMock.restore();

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
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['account'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsIniAccountModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`[]`);
  });

  it('should CUD', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    const result = await testModuleContainer.commit(app, { enableResourceCapture: true });
    expect(result.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    container.unRegisterFactory('AwsCredentialIdentityProvider', {
      metadata: {
        awsAccountId: '123',
        package: '@octo',
      },
    });
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(resultUpdateTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    container.unRegisterFactory('AwsCredentialIdentityProvider', {
      metadata: {
        awsAccountId: '123',
        package: '@octo',
      },
    });
    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account',
      type: AwsIniAccountModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(resultDeleteTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
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
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

    container.unRegisterFactory('AwsCredentialIdentityProvider', {
      metadata: {
        awsAccountId: '123',
        package: '@octo',
      },
    });
    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsIniAccountModule>({
      inputs: {
        accountId: '123',
        app: stub('${{testModule.model.app}}'),
      },
      moduleId: 'account-2',
      type: AwsIniAccountModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(resultUpdateModuleId.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });
});
