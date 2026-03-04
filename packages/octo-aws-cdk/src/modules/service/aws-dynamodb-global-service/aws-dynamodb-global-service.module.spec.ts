import {
  DescribeTableCommand,
  DynamoDBClient,
  TableStatus,
  TagResourceCommand,
  UpdateTableCommand,
} from '@aws-sdk/client-dynamodb';
import { jest } from '@jest/globals';
import { type Account, type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import type { DynamoDBSchema } from '../../../resources/dynamodb/index.schema.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsDynamoDBGlobalServiceModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
    service: [service],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    service: [['dynamodb-service', { tableName: 'test-table' }]],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  const {
    region: [region1],
  } = await testModuleContainer.createTestModels('testRegion1Module', {
    account: [account],
    app: [app],
    region: ['region-1'],
  });
  const {
    region: [region2],
  } = await testModuleContainer.createTestModels('testRegion2Module', {
    account: [account],
    app: [app],
    region: ['region-2'],
  });

  region1.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region1,
    ),
  );
  region2.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-west-2a'],
        awsRegionId: 'us-west-2',
        regionId: 'aws-us-west-2a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region2,
    ),
  );

  service.addAnchor(
    testModuleContainer.createTestAnchor<AwsDynamoDBAnchorSchema>(
      'AwsDynamoDBAnchor',
      {
        TableName: 'test-table',
      },
      service,
    ),
  );

  await testModuleContainer.createTestResources<[DynamoDBSchema]>(
    'testModule',
    [
      {
        properties: {
          AttributeDefinitions: [],
          awsAccountId: '123',
          awsRegionId: 'us-east-1',
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          DeletionProtectionEnabled: false,
          GlobalSecondaryIndexes: [],
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          LocalSecondaryIndexes: [],
          TableClass: 'STANDARD',
          TableName: 'test-table',
        },
        resourceContext: '@octo/dynamodb=dynamodb-test-table',
        response: {
          LatestStreamArn: 'LatestStreamArn',
          TableArn: 'TableArn',
          TableId: 'TableId',
        },
      },
    ],
    {
      save: true,
    },
  );

  return { account, app };
}

describe('AwsDynamoDBGlobalServiceModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  const DynamoDBClientMock = mockClient(DynamoDBClient);

  beforeEach(async () => {
    DynamoDBClientMock.on(DescribeTableCommand).resolves({
      Table: {
        LatestStreamArn: 'arn:aws:dynamodb:us-east-1:123:table/test-table/stream/2024-01-01T00:00:00.000',
        TableArn: 'arn:aws:dynamodb:us-east-1:123:table/test-table',
        TableId: 'test-table-id',
        TableStatus: TableStatus.ACTIVE,
      },
    });
    DynamoDBClientMock.on(UpdateTableCommand).resolves({});
    DynamoDBClientMock.on(TagResourceCommand).resolves({});

    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: DynamoDBClient,
            value: DynamoDBClientMock,
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    retryPromiseSpy = jest.spyOn(RetryUtility, 'retryPromise').mockImplementation(async (fn, options) => {
      await originalRetryPromise(fn, { ...options, initialDelayInMs: 0, retryDelayInMs: 0, throwOnError: true });
    });
  });

  afterEach(async () => {
    DynamoDBClientMock.restore();

    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockRestore();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['global-dynamodb-module'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsDynamoDBGlobalServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "UpdateDynamoDBGlobalResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/dynamodb-global=dynamodb-global-test-table",
           "value": {
             "replicaDiffs": [
               {
                 "action": "add",
                 "properties": {
                   "awsAccountId": "123",
                   "awsRegionId": "us-east-1",
                 },
               },
             ],
             "tagUpdates": [
               {
                 "awsAccountId": "123",
                 "awsRegionId": "us-east-1",
                 "tags": {
                   "key1": "value1",
                 },
               },
             ],
           },
         },
       ],
       [],
     ]
    `);

    const { app: appNoChange } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultNoChange = await testModuleContainer.commit(appNoChange, { enableResourceCapture: true });
    expect(resultNoChange.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    const { app: appAddReplica } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [
          { region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } },
          { region: stub('${{testRegion2Module.model.region}}'), tags: {} },
        ],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultAddReplica = await testModuleContainer.commit(appAddReplica, { enableResourceCapture: true });
    expect(resultAddReplica.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/dynamodb-global=dynamodb-global-test-table",
           "value": {
             "replicaDiffs": [
               {
                 "action": "add",
                 "properties": {
                   "awsAccountId": "123",
                   "awsRegionId": "us-west-2",
                 },
               },
             ],
             "tagUpdates": [
               {
                 "awsAccountId": "123",
                 "awsRegionId": "us-east-1",
                 "tags": {
                   "key1": "value1",
                 },
               },
               {
                 "awsAccountId": "123",
                 "awsRegionId": "us-west-2",
                 "tags": {},
               },
             ],
           },
         },
       ],
       [],
     ]
    `);

    const { app: appRemoveReplica } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { key1: 'value1' } }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultRemoveReplica = await testModuleContainer.commit(appRemoveReplica, { enableResourceCapture: true });
    expect(resultRemoveReplica.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/dynamodb-global=dynamodb-global-test-table",
           "value": {
             "replicaDiffs": [
               {
                 "action": "delete",
                 "properties": {
                   "awsAccountId": "123",
                   "awsRegionId": "us-west-2",
                 },
               },
             ],
             "tagUpdates": [
               {
                 "awsAccountId": "123",
                 "awsRegionId": "us-east-1",
                 "tags": {
                   "key1": "value1",
                 },
               },
             ],
           },
         },
       ],
       [],
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(resultDelete.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "properties",
           "node": "@octo/dynamodb-global=dynamodb-global-test-table",
           "value": {
             "replicaDiffs": [
               {
                 "action": "delete",
                 "properties": {
                   "awsAccountId": "123",
                   "awsRegionId": "us-east-1",
                 },
               },
             ],
             "tagUpdates": [],
           },
         },
       ],
       [],
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}') }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/dynamodb-global=dynamodb-global-test-table",
           "value": {
             "replicaDiffs": [
               {
                 "action": "add",
                 "properties": {
                   "awsAccountId": "123",
                   "awsRegionId": "us-east-1",
                 },
               },
             ],
             "tagUpdates": [
               {
                 "awsAccountId": "123",
                 "awsRegionId": "us-east-1",
                 "tags": {
                   "tag1": "value1",
                 },
               },
             ],
           },
         },
       ],
       [],
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [
          { region: stub('${{testRegion1Module.model.region}}'), tags: { tag1: 'value1_1', tag2: 'value2_1' } },
        ],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(resultUpdateTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/dynamodb-global=dynamodb-global-test-table",
           "value": {
             "replicaDiffs": [],
             "tagUpdates": [
               {
                 "awsAccountId": "123",
                 "awsRegionId": "us-east-1",
                 "tags": {
                   "tag1": "value1_1",
                   "tag2": "value2_1",
                 },
               },
             ],
           },
         },
       ],
       [],
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
      },
      moduleId: 'global-dynamodb-module',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(resultDeleteTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "properties",
           "node": "@octo/dynamodb-global=dynamodb-global-test-table",
           "value": {
             "replicaDiffs": [],
             "tagUpdates": [
               {
                 "awsAccountId": "123",
                 "awsRegionId": "us-east-1",
                 "tags": {},
               },
             ],
           },
         },
       ],
       [],
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle replica add', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appAddReplica } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [
            { region: stub('${{testRegion1Module.model.region}}'), tags: {} },
            { region: stub('${{testRegion2Module.model.region}}'), tags: { env: 'replica2' } },
          ],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      const resultAddReplica = await testModuleContainer.commit(appAddReplica, { enableResourceCapture: true });
      expect(resultAddReplica.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "@octo/dynamodb-global=dynamodb-global-test-table",
             "value": {
               "replicaDiffs": [
                 {
                   "action": "add",
                   "properties": {
                     "awsAccountId": "123",
                     "awsRegionId": "us-west-2",
                   },
                 },
               ],
               "tagUpdates": [
                 {
                   "awsAccountId": "123",
                   "awsRegionId": "us-east-1",
                   "tags": {},
                 },
                 {
                   "awsAccountId": "123",
                   "awsRegionId": "us-west-2",
                   "tags": {
                     "env": "replica2",
                   },
                 },
               ],
             },
           },
         ],
         [],
       ]
      `);
    });

    it('should handle replica delete', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [
            { region: stub('${{testRegion1Module.model.region}}'), tags: {} },
            { region: stub('${{testRegion2Module.model.region}}'), tags: {} },
          ],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appRemoveReplica } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      const resultRemoveReplica = await testModuleContainer.commit(appRemoveReplica, { enableResourceCapture: true });
      expect(resultRemoveReplica.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "@octo/dynamodb-global=dynamodb-global-test-table",
             "value": {
               "replicaDiffs": [
                 {
                   "action": "delete",
                   "properties": {
                     "awsAccountId": "123",
                     "awsRegionId": "us-west-2",
                   },
                 },
               ],
               "tagUpdates": [
                 {
                   "awsAccountId": "123",
                   "awsRegionId": "us-east-1",
                   "tags": {},
                 },
               ],
             },
           },
         ],
         [],
       ]
      `);
    });

    it('should handle replica tags update', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { a: '1' } }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateReplicaTags } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
        inputs: {
          dynamoDBService: stub('${{testModule.model.service}}'),
          replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: { a: '2', b: '3' } }],
        },
        moduleId: 'global-dynamodb-module',
        type: AwsDynamoDBGlobalServiceModule,
      });
      const resultUpdateReplicaTags = await testModuleContainer.commit(appUpdateReplicaTags, {
        enableResourceCapture: true,
      });
      expect(resultUpdateReplicaTags.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "@octo/dynamodb-global=dynamodb-global-test-table",
             "value": {
               "replicaDiffs": [],
               "tagUpdates": [
                 {
                   "awsAccountId": "123",
                   "awsRegionId": "us-east-1",
                   "tags": {
                     "a": "2",
                     "b": "3",
                   },
                 },
               ],
             },
           },
         ],
         [],
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
      },
      moduleId: 'global-dynamodb-module-1',
      type: AwsDynamoDBGlobalServiceModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBGlobalServiceModule>({
      inputs: {
        dynamoDBService: stub('${{testModule.model.service}}'),
        replicas: [{ region: stub('${{testRegion1Module.model.region}}'), tags: {} }],
      },
      moduleId: 'global-dynamodb-module-2',
      type: AwsDynamoDBGlobalServiceModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, {
      enableResourceCapture: true,
    });
    expect(resultUpdateModuleId.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);
  });
});
