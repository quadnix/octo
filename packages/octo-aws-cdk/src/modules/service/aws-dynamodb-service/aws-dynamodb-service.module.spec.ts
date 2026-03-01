import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  type DescribeTableCommandOutput,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  TableStatus,
  UpdateTableCommand,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';
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
import { AwsDynamoDBServiceModule } from './index.js';

const TABLE_ARN = 'arn:aws:dynamodb:us-east-1:123:table/test-table';
const TABLE_ID = 'test-table-id';
const STREAM_ARN = 'arn:aws:dynamodb:us-east-1:123:table/test-table/stream/2024-01-01T00:00:00.000';

function makeDescribeTableResponse(
  options: {
    GlobalSecondaryIndexes?: {
      IndexName: string;
      IndexStatus: string;
      KeySchema: { AttributeName: string; KeyType: string }[];
      Projection: { ProjectionType: string };
    }[];
    LocalSecondaryIndexes?: {
      IndexName: string;
      KeySchema: { AttributeName: string; KeyType: string }[];
      Projection: { ProjectionType: string };
    }[];
    streamArn?: string;
    streamEnabled?: boolean;
    streamViewType?: string;
  } = {},
): Partial<DescribeTableCommandOutput> {
  return {
    Table: {
      GlobalSecondaryIndexes: options.GlobalSecondaryIndexes as any,
      LatestStreamArn: options.streamArn,
      LocalSecondaryIndexes: options.LocalSecondaryIndexes as any,
      StreamSpecification: options.streamEnabled
        ? { StreamEnabled: true, StreamViewType: options.streamViewType as any }
        : undefined,
      TableArn: TABLE_ARN,
      TableId: TABLE_ID,
      TableStatus: TableStatus.ACTIVE,
    },
  };
}

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

describe('AwsDynamoDBServiceModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  const DynamoDBClientMock = mockClient(DynamoDBClient);
  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);

  beforeEach(async () => {
    DynamoDBClientMock.on(CreateTableCommand).resolves({
      TableDescription: {
        TableArn: TABLE_ARN,
        TableId: TABLE_ID,
        TableStatus: 'ACTIVE',
      },
    });
    DynamoDBClientMock.on(DescribeTableCommand).resolves(makeDescribeTableResponse());
    DynamoDBClientMock.on(DescribeTimeToLiveCommand).resolves({ TimeToLiveDescription: {} });
    DynamoDBClientMock.on(DeleteTableCommand).resolves({});
    DynamoDBClientMock.on(UpdateTableCommand).resolves({});
    DynamoDBClientMock.on(UpdateTimeToLiveCommand).resolves({});

    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: DynamoDBClient,
            value: DynamoDBClientMock,
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
      await originalRetryPromise(fn, { ...options, initialDelayInMs: 0, retryDelayInMs: 0, throwOnError: true });
    });
  });

  afterEach(async () => {
    DynamoDBClientMock.restore();
    ResourceGroupsTaggingAPIClientMock.restore();

    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockRestore();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'dynamodb-module',
      type: AwsDynamoDBServiceModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['dynamodb-module'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsDynamoDBServiceModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddDynamoDBResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service',
      type: AwsDynamoDBServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/dynamodb=dynamodb-test-table",
           "value": "@octo/dynamodb=dynamodb-test-table",
         },
       ],
       [],
     ]
    `);

    const { app: appNoChange } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service',
      type: AwsDynamoDBServiceModule,
    });
    const resultNoChange = await testModuleContainer.commit(appNoChange, { enableResourceCapture: true });
    expect(resultNoChange.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    // Mocks for table not found.
    DynamoDBClientMock.reset();
    DynamoDBClientMock.on(DeleteTableCommand).resolves({});
    DynamoDBClientMock.on(DescribeTableCommand).rejects(
      new ResourceNotFoundException({ $metadata: {}, message: 'Table not found' }),
    );

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(resultDelete.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/dynamodb=dynamodb-test-table",
           "value": "@octo/dynamodb=dynamodb-test-table",
         },
       ],
       [],
     ]
    `);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service',
      type: AwsDynamoDBServiceModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/dynamodb=dynamodb-test-table",
           "value": "@octo/dynamodb=dynamodb-test-table",
         },
       ],
       [],
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service',
      type: AwsDynamoDBServiceModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(resultUpdateTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/dynamodb=dynamodb-test-table",
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

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
          type: 'PROVISIONED',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service',
      type: AwsDynamoDBServiceModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(resultDeleteTags.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/dynamodb=dynamodb-test-table",
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

  describe('input changes', () => {
    it('should handle billingMode change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appUpdateBillingProvisionedThroughput } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 10, WriteCapacityUnits: 10 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultUpdateBillingProvisionedThroughput = await testModuleContainer.commit(
        appUpdateBillingProvisionedThroughput,
        { enableResourceCapture: true },
      );
      expect(resultUpdateBillingProvisionedThroughput.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "@octo/dynamodb=dynamodb-test-table",
             "value": {
               "GlobalSecondaryIndexDiffs": [],
             },
           },
         ],
         [],
       ]
      `);

      const { app: appUpdateBillingPayPerRequest } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { OnDemandThroughput: { MaxReadRequestUnits: 5, MaxWriteRequestUnits: 5 } },
            type: 'PAY_PER_REQUEST',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultUpdateBillingPayPerRequest = await testModuleContainer.commit(appUpdateBillingPayPerRequest, {
        enableResourceCapture: true,
      });
      expect(resultUpdateBillingPayPerRequest.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "@octo/dynamodb=dynamodb-test-table",
             "value": {
               "GlobalSecondaryIndexDiffs": [],
             },
           },
         ],
         [],
       ]
      `);
    });

    describe('should handle GlobalSecondaryIndexes change', () => {
      it('should create table with GSI', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'email', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
        expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/dynamodb=dynamodb-test-table",
               "value": "@octo/dynamodb=dynamodb-test-table",
             },
           ],
           [],
         ]
        `);
      });

      it('should add a GSI to an existing table', async () => {
        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

        // Mocks to describe GSI.
        DynamoDBClientMock.on(DescribeTableCommand).resolves(
          makeDescribeTableResponse({
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                IndexStatus: 'ACTIVE',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            streamArn: STREAM_ARN,
            streamEnabled: true,
            streamViewType: 'NEW_AND_OLD_IMAGES',
          }),
        );

        const { app: appAddGSI } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'email', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        const resultAddGSI = await testModuleContainer.commit(appAddGSI, { enableResourceCapture: true });
        expect(resultAddGSI.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "properties",
               "node": "@octo/dynamodb=dynamodb-test-table",
               "value": {
                 "GlobalSecondaryIndexDiffs": [
                   {
                     "action": "add",
                     "properties": {
                       "IndexName": "GSI-email",
                       "KeySchema": [
                         {
                           "AttributeName": "email",
                           "KeyType": "HASH",
                         },
                       ],
                       "Projection": {
                         "ProjectionType": "ALL",
                       },
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

      it('should throw error updating a GSI in an existing table', async () => {
        // Mocks to describe GSI.
        DynamoDBClientMock.on(CreateTableCommand).resolves({
          TableDescription: {
            LatestStreamArn: STREAM_ARN,
            TableArn: TABLE_ARN,
            TableId: TABLE_ID,
            TableStatus: 'ACTIVE',
          },
        });
        DynamoDBClientMock.on(DescribeTableCommand).resolves(
          makeDescribeTableResponse({
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                IndexStatus: 'ACTIVE',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            streamArn: STREAM_ARN,
            streamEnabled: true,
            streamViewType: 'NEW_AND_OLD_IMAGES',
          }),
        );

        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'email', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

        // Mocks to describe GSI.
        DynamoDBClientMock.on(DescribeTableCommand).resolves(
          makeDescribeTableResponse({
            streamArn: STREAM_ARN,
            streamEnabled: true,
            streamViewType: 'NEW_AND_OLD_IMAGES',
          }),
        );

        const { app: appUpdateGSIWithoutUpdatingIndex } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'UserId', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'UserId', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await expect(async () => {
          await testModuleContainer.commit(appUpdateGSIWithoutUpdatingIndex, {
            enableResourceCapture: true,
          });
        }).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot update DynamoDB GSIs immutable properties once it has been created!"`,
        );
      });

      it('should replace a GSI in an existing table', async () => {
        // Mocks to describe GSI.
        DynamoDBClientMock.on(CreateTableCommand).resolves({
          TableDescription: {
            LatestStreamArn: STREAM_ARN,
            TableArn: TABLE_ARN,
            TableId: TABLE_ID,
            TableStatus: 'ACTIVE',
          },
        });
        DynamoDBClientMock.on(DescribeTableCommand).resolves(
          makeDescribeTableResponse({
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                IndexStatus: 'ACTIVE',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            streamArn: STREAM_ARN,
            streamEnabled: true,
            streamViewType: 'NEW_AND_OLD_IMAGES',
          }),
        );

        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'email', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

        // Mocks to describe GSI.
        DynamoDBClientMock.on(DescribeTableCommand).resolves(
          makeDescribeTableResponse({
            streamArn: STREAM_ARN,
            streamEnabled: true,
            streamViewType: 'NEW_AND_OLD_IMAGES',
          }),
        );

        const { app: appUpdateGSI } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'UserId', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-user',
                KeySchema: [{ AttributeName: 'UserId', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        const resultUpdateGSI = await testModuleContainer.commit(appUpdateGSI, { enableResourceCapture: true });
        expect(resultUpdateGSI.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "properties",
               "node": "@octo/dynamodb=dynamodb-test-table",
               "value": {
                 "GlobalSecondaryIndexDiffs": [
                   {
                     "action": "delete",
                     "properties": {
                       "IndexName": "GSI-email",
                       "KeySchema": [
                         {
                           "AttributeName": "email",
                           "KeyType": "HASH",
                         },
                       ],
                       "Projection": {
                         "ProjectionType": "ALL",
                       },
                     },
                   },
                   {
                     "action": "add",
                     "properties": {
                       "IndexName": "GSI-user",
                       "KeySchema": [
                         {
                           "AttributeName": "UserId",
                           "KeyType": "HASH",
                         },
                       ],
                       "Projection": {
                         "ProjectionType": "ALL",
                       },
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

      it('should delete a GSI from an existing table', async () => {
        // Mocks to describe GSI.
        DynamoDBClientMock.on(CreateTableCommand).resolves({
          TableDescription: {
            LatestStreamArn: STREAM_ARN,
            TableArn: TABLE_ARN,
            TableId: TABLE_ID,
            TableStatus: 'ACTIVE',
          },
        });
        DynamoDBClientMock.on(DescribeTableCommand).resolves(
          makeDescribeTableResponse({
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                IndexStatus: 'ACTIVE',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            streamArn: STREAM_ARN,
            streamEnabled: true,
            streamViewType: 'NEW_AND_OLD_IMAGES',
          }),
        );

        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'email', AttributeType: 'S' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            GlobalSecondaryIndexes: [
              {
                IndexName: 'GSI-email',
                KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

        // Mocks to describe GSI.
        DynamoDBClientMock.on(DescribeTableCommand).resolves(
          makeDescribeTableResponse({
            streamArn: STREAM_ARN,
            streamEnabled: true,
            streamViewType: 'NEW_AND_OLD_IMAGES',
          }),
        );

        const { app: appRemoveGSI } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
            region: stub('${{testModule.model.region}}'),
            StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        const resultRemoveGSI = await testModuleContainer.commit(appRemoveGSI, { enableResourceCapture: true });
        expect(resultRemoveGSI.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "update",
               "field": "properties",
               "node": "@octo/dynamodb=dynamodb-test-table",
               "value": {
                 "GlobalSecondaryIndexDiffs": [
                   {
                     "action": "delete",
                     "properties": {
                       "IndexName": "GSI-email",
                       "KeySchema": [
                         {
                           "AttributeName": "email",
                           "KeyType": "HASH",
                         },
                       ],
                       "Projection": {
                         "ProjectionType": "ALL",
                       },
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

    describe('should handle LocalSecondaryIndexes change', () => {
      it('should create table with LSI', async () => {
        // Mocks to describe LSI.
        DynamoDBClientMock.on(DescribeTableCommand).resolves(
          makeDescribeTableResponse({
            LocalSecondaryIndexes: [
              {
                IndexName: 'LSI-created',
                KeySchema: [
                  { AttributeName: 'AccountId', KeyType: 'HASH' },
                  { AttributeName: 'created', KeyType: 'RANGE' },
                ],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
          }),
        );

        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'SortKey', AttributeType: 'S' },
              { AttributeName: 'created', AttributeType: 'N' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [
              { AttributeName: 'AccountId', KeyType: 'HASH' },
              { AttributeName: 'SortKey', KeyType: 'RANGE' },
            ],
            LocalSecondaryIndexes: [
              {
                IndexName: 'LSI-created',
                KeySchema: [
                  { AttributeName: 'AccountId', KeyType: 'HASH' },
                  { AttributeName: 'created', KeyType: 'RANGE' },
                ],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            region: stub('${{testModule.model.region}}'),
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
        expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
         [
           [
             {
               "action": "add",
               "field": "resourceId",
               "node": "@octo/dynamodb=dynamodb-test-table",
               "value": "@octo/dynamodb=dynamodb-test-table",
             },
           ],
           [],
         ]
        `);
      });

      it('should throw error updating a LSI on an existing table', async () => {
        // Mocks to describe LSI.
        DynamoDBClientMock.on(DescribeTableCommand).resolves(
          makeDescribeTableResponse({
            LocalSecondaryIndexes: [
              {
                IndexName: 'LSI-created',
                KeySchema: [
                  { AttributeName: 'AccountId', KeyType: 'HASH' },
                  { AttributeName: 'created', KeyType: 'RANGE' },
                ],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
          }),
        );

        const { app: appCreate } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'SortKey', AttributeType: 'S' },
              { AttributeName: 'created', AttributeType: 'N' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [
              { AttributeName: 'AccountId', KeyType: 'HASH' },
              { AttributeName: 'SortKey', KeyType: 'RANGE' },
            ],
            LocalSecondaryIndexes: [
              {
                IndexName: 'LSI-created',
                KeySchema: [
                  { AttributeName: 'AccountId', KeyType: 'HASH' },
                  { AttributeName: 'created', KeyType: 'RANGE' },
                ],
                Projection: { ProjectionType: 'ALL' },
              },
            ],
            region: stub('${{testModule.model.region}}'),
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });
        await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

        const { app: appUpdateLSI } = await setup(testModuleContainer);
        await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
          inputs: {
            AttributeDefinitions: [
              { AttributeName: 'AccountId', AttributeType: 'S' },
              { AttributeName: 'SortKey', AttributeType: 'S' },
              { AttributeName: 'created', AttributeType: 'N' },
            ],
            billingMode: {
              settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
              type: 'PROVISIONED',
            },
            KeySchema: [
              { AttributeName: 'AccountId', KeyType: 'HASH' },
              { AttributeName: 'SortKey', KeyType: 'RANGE' },
            ],
            LocalSecondaryIndexes: [
              {
                IndexName: 'LSI-created',
                KeySchema: [
                  { AttributeName: 'AccountId', KeyType: 'HASH' },
                  { AttributeName: 'created', KeyType: 'RANGE' },
                ],
                Projection: { ProjectionType: 'KEYS_ONLY' },
              },
            ],
            region: stub('${{testModule.model.region}}'),
            TableName: 'test-table',
          },
          moduleId: 'service',
          type: AwsDynamoDBServiceModule,
        });

        await expect(
          testModuleContainer.commit(appUpdateLSI, { enableResourceCapture: true }),
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `"Cannot update DynamoDB immutable properties once it has been created!"`,
        );
      });
    });

    it('should handle StreamSpecification change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      // Mocks to add stream.
      DynamoDBClientMock.on(DescribeTableCommand).resolves(
        makeDescribeTableResponse({ streamArn: STREAM_ARN, streamEnabled: true, streamViewType: 'NEW_AND_OLD_IMAGES' }),
      );

      const { app: appAddStream } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultAddStream = await testModuleContainer.commit(appAddStream, { enableResourceCapture: true });
      expect(resultAddStream.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "@octo/dynamodb=dynamodb-test-table",
             "value": {
               "GlobalSecondaryIndexDiffs": [],
             },
           },
         ],
         [],
       ]
      `);

      // Mocks to remove stream.
      DynamoDBClientMock.on(DescribeTableCommand).resolves(makeDescribeTableResponse());

      const { app: appRemoveStream } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultRemoveStream = await testModuleContainer.commit(appRemoveStream, { enableResourceCapture: true });
      expect(resultRemoveStream.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "@octo/dynamodb=dynamodb-test-table",
             "value": {
               "GlobalSecondaryIndexDiffs": [],
             },
           },
         ],
         [],
       ]
      `);
    });

    it('should handle timeToLiveAttribute change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

      const { app: appAddTTL } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
          timeToLiveAttribute: 'expiresAt',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultAddTTL = await testModuleContainer.commit(appAddTTL, { enableResourceCapture: true });
      expect(resultAddTTL.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "@octo/dynamodb=dynamodb-test-table",
             "value": {
               "GlobalSecondaryIndexDiffs": [],
             },
           },
         ],
         [],
       ]
      `);

      // Mocks to describe TTL.
      DynamoDBClientMock.on(DescribeTimeToLiveCommand).resolves({
        TimeToLiveDescription: { AttributeName: 'expiresAt', TimeToLiveStatus: 'ENABLED' },
      });

      const { app: appRemoveTTL } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
        inputs: {
          AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
          billingMode: {
            settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
            type: 'PROVISIONED',
          },
          KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
          region: stub('${{testModule.model.region}}'),
          TableName: 'test-table',
        },
        moduleId: 'service',
        type: AwsDynamoDBServiceModule,
      });
      const resultRemoveTTL = await testModuleContainer.commit(appRemoveTTL, { enableResourceCapture: true });
      expect(resultRemoveTTL.resourceDiffs).toMatchInlineSnapshot(`
       [
         [
           {
             "action": "update",
             "field": "properties",
             "node": "@octo/dynamodb=dynamodb-test-table",
             "value": {
               "GlobalSecondaryIndexDiffs": [],
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
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { OnDemandThroughput: { MaxReadRequestUnits: 5, MaxWriteRequestUnits: 5 } },
          type: 'PAY_PER_REQUEST',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service-1',
      type: AwsDynamoDBServiceModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
      inputs: {
        AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
        billingMode: {
          settings: { OnDemandThroughput: { MaxReadRequestUnits: 5, MaxWriteRequestUnits: 5 } },
          type: 'PAY_PER_REQUEST',
        },
        KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
        region: stub('${{testModule.model.region}}'),
        TableName: 'test-table',
      },
      moduleId: 'service-2',
      type: AwsDynamoDBServiceModule,
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
