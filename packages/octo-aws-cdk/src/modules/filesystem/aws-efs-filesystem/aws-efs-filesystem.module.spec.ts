import { CreateFileSystemCommand, DescribeFileSystemsCommand, EFSClient } from '@aws-sdk/client-efs';
import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { jest } from '@jest/globals';
import { type Account, type App, type Region, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsEfsFilesystemModule } from './index.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  return { account, app, region };
}

describe('AwsEfsFilesystemModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  const EFSClientMock = mockClient(EFSClient);
  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);

  beforeEach(async () => {
    EFSClientMock.on(CreateFileSystemCommand)
      .resolves({
        FileSystemArn: 'FileSystemArn',
        FileSystemId: 'FileSystemId',
      })
      .on(DescribeFileSystemsCommand)
      .callsFake(() => {
        const states = ['available', 'deleted'];
        return {
          FileSystems: [
            {
              FileSystemId: 'FileSystemId',
              LifeCycleState: states[Math.floor(Math.random() * states.length)],
            },
          ],
        };
      });

    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: EFSClient,
            value: EFSClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: ResourceGroupsTaggingAPIClient,
            value: ResourceGroupsTaggingAPIClientMock,
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    retryPromiseSpy = jest.spyOn(RetryUtility, 'retryPromise').mockImplementation(async (fn, options) => {
      await originalRetryPromise(fn, {
        ...options,
        initialDelayInMs: 0,
        maxRetries: 15,
        retryDelayInMs: 0,
        throwOnError: true,
      });
    });
  });

  afterEach(async () => {
    EFSClientMock.restore();
    ResourceGroupsTaggingAPIClientMock.restore();

    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['filesystem'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEfsFilesystemModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddEfsResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });

    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/efs=efs-region-test-filesystem",
           "value": "@octo/efs=efs-region-test-filesystem",
         },
       ],
       [],
     ]
    `);

    const { app: app2 } = await setup(testModuleContainer);

    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/efs=efs-region-test-filesystem",
           "value": "@octo/efs=efs-region-test-filesystem",
         },
       ],
       [],
     ]
    `);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/efs=efs-region-test-filesystem",
           "value": "@octo/efs=efs-region-test-filesystem",
         },
       ],
       [],
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/efs=efs-region-test-filesystem",
           "value": {
             "add": {
               "tag2": "value2",
             },
             "delete": [],
             "update": {
               "tag1": "value1_1",
             },
           },
         },
       ],
       [],
     ]
    `);

    const { app: app3 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEfsFilesystemModule>({
      inputs: {
        filesystemName: 'test-filesystem',
        region: stub('${{testModule.model.region}}'),
      },
      moduleId: 'filesystem',
      type: AwsEfsFilesystemModule,
    });
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/efs=efs-region-test-filesystem",
           "value": {
             "add": {},
             "delete": [
               "tag1",
               "tag2",
             ],
             "update": {},
           },
         },
       ],
       [],
     ]
    `);
  });
});
