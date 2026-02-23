import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DescribeTimeToLiveCommand,
  DynamoDBClient,
  ResourceNotFoundException,
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
        LatestStreamArn: undefined,
        TableArn: 'TableArn',
        TableId: 'TableId',
        TableStatus: 'ACTIVE',
      },
    });
    DynamoDBClientMock.on(DescribeTableCommand).resolves({
      Table: {
        LatestStreamArn: undefined,
        TableArn: 'TableArn',
        TableId: 'TableId',
        TableStatus: 'ACTIVE',
      },
    });
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

  // it('should CUD', async () => {
  //   // --- CREATE ---
  //   const { app: appCreate } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  //   expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "add",
  //          "field": "resourceId",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": "@octo/dynamodb=dynamodb-test-table",
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  //
  //   // --- NO CHANGE ---
  //   const { app: appNoChange } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultNoChange = await testModuleContainer.commit(appNoChange, { enableResourceCapture: true });
  //   expect(resultNoChange.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [],
  //      [],
  //    ]
  //   `);
  //
  //   // --- DELETE: submit empty app (no module run) ---
  //   // Configure DescribeTableCommand to throw so waitUntilTableNotExists succeeds.
  //   DynamoDBClientMock.reset();
  //   DynamoDBClientMock.on(DeleteTableCommand).resolves({});
  //   DynamoDBClientMock.on(DescribeTableCommand).rejects(
  //     new ResourceNotFoundException({ $metadata: {}, message: 'Table not found' }),
  //   );
  //
  //   const { app: appDelete } = await setup(testModuleContainer);
  //   const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
  //   expect(resultDelete.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "delete",
  //          "field": "resourceId",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": "@octo/dynamodb=dynamodb-test-table",
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  // });
  //
  // // -------------------------------------------------------------------------
  // // Streams
  // // -------------------------------------------------------------------------
  //
  // it('should add and remove streams', async () => {
  //   // Create without streams.
  //   const { app: appCreate } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  //
  //   // Add streams.
  //   DynamoDBClientMock.on(DescribeTableCommand).resolves(
  //     makeDescribeTableResponse({ streamEnabled: true, streamViewType: 'NEW_AND_OLD_IMAGES', streamArn: STREAM_ARN }),
  //   );
  //
  //   const { app: appAddStream } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultAddStream = await testModuleContainer.commit(appAddStream, { enableResourceCapture: true });
  //   expect(resultAddStream.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "update",
  //          "field": "properties",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": {
  //            "GlobalSecondaryIndexDiffs": [],
  //          },
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  //
  //   // Remove streams.
  //   DynamoDBClientMock.on(DescribeTableCommand).resolves(makeDescribeTableResponse());
  //
  //   const { app: appRemoveStream } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultRemoveStream = await testModuleContainer.commit(appRemoveStream, { enableResourceCapture: true });
  //   expect(resultRemoveStream.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "update",
  //          "field": "properties",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": {
  //            "GlobalSecondaryIndexDiffs": [],
  //          },
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  // });
  //
  // // -------------------------------------------------------------------------
  // // TTL
  // // -------------------------------------------------------------------------
  //
  // it('should add and remove TTL', async () => {
  //   // Create without TTL.
  //   const { app: appCreate } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  //
  //   // Add TTL.
  //   const { app: appAddTtl } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //       timeToLiveAttribute: 'expiresAt',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultAddTtl = await testModuleContainer.commit(appAddTtl, { enableResourceCapture: true });
  //   expect(resultAddTtl.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "update",
  //          "field": "properties",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": {
  //            "GlobalSecondaryIndexDiffs": [],
  //          },
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  //
  //   // Remove TTL (mock DescribeTimeToLive to return the active TTL attribute).
  //   DynamoDBClientMock.on(DescribeTimeToLiveCommand).resolves({
  //     TimeToLiveDescription: { AttributeName: 'expiresAt', TimeToLiveStatus: 'ENABLED' },
  //   });
  //
  //   const { app: appRemoveTtl } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultRemoveTtl = await testModuleContainer.commit(appRemoveTtl, { enableResourceCapture: true });
  //   expect(resultRemoveTtl.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "update",
  //          "field": "properties",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": {
  //            "GlobalSecondaryIndexDiffs": [],
  //          },
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  // });
  //
  // // -------------------------------------------------------------------------
  // // Billing mode
  // // -------------------------------------------------------------------------
  //
  // it('should change billing mode', async () => {
  //   // Create with PAY_PER_REQUEST (default).
  //   const { app: appCreate } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  //
  //   // Switch to PROVISIONED.
  //   DynamoDBClientMock.on(DescribeTableCommand).resolves({
  //     Table: {
  //       ...makeDescribeTableResponse().Table,
  //       BillingModeSummary: { BillingMode: 'PROVISIONED' },
  //     },
  //   });
  //
  //   const { app: appProvisioned } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       billingMode: {
  //         settings: { ProvisionedThroughput: { ReadCapacityUnits: 10, WriteCapacityUnits: 10 } },
  //         type: 'PROVISIONED',
  //       },
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultProvisioned = await testModuleContainer.commit(appProvisioned, { enableResourceCapture: true });
  //   expect(resultProvisioned.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "update",
  //          "field": "properties",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": {
  //            "GlobalSecondaryIndexDiffs": [],
  //          },
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  // });
  //
  // // -------------------------------------------------------------------------
  // // Global Secondary Indexes
  // // -------------------------------------------------------------------------
  //
  // it('should create table with GSI', async () => {
  //   const { app: appCreate } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [
  //         { AttributeName: 'pk', AttributeType: 'S' },
  //         { AttributeName: 'email', AttributeType: 'S' },
  //       ],
  //       GlobalSecondaryIndexes: [
  //         {
  //           IndexName: 'gsi-email',
  //           KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
  //           Projection: { ProjectionType: 'ALL' },
  //         },
  //       ],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  //   expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "add",
  //          "field": "resourceId",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": "@octo/dynamodb=dynamodb-test-table",
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  // });
  //
  // it('should add a GSI to an existing table', async () => {
  //   // Create without GSI.
  //   const { app: appCreate } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  //
  //   // Update DescribeTable mock to reflect the new GSI once created.
  //   DynamoDBClientMock.on(DescribeTableCommand).resolves(
  //     makeDescribeTableResponse({
  //       gsis: [
  //         {
  //           IndexName: 'gsi-email',
  //           IndexStatus: 'ACTIVE',
  //           KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
  //           Projection: { ProjectionType: 'ALL' },
  //         },
  //       ],
  //       streamEnabled: true,
  //       streamViewType: 'NEW_AND_OLD_IMAGES',
  //       streamArn: STREAM_ARN,
  //     }),
  //   );
  //
  //   const { app: appAddGsi } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [
  //         { AttributeName: 'pk', AttributeType: 'S' },
  //         { AttributeName: 'email', AttributeType: 'S' },
  //       ],
  //       GlobalSecondaryIndexes: [
  //         {
  //           IndexName: 'gsi-email',
  //           KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
  //           Projection: { ProjectionType: 'ALL' },
  //         },
  //       ],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultAddGsi = await testModuleContainer.commit(appAddGsi, { enableResourceCapture: true });
  //   expect(resultAddGsi.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "update",
  //          "field": "properties",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": {
  //            "GlobalSecondaryIndexDiffs": [
  //              {
  //                "action": "add",
  //                "properties": {
  //                  "IndexName": "gsi-email",
  //                  "KeySchema": [
  //                    {
  //                      "AttributeName": "email",
  //                      "KeyType": "HASH",
  //                    },
  //                  ],
  //                  "Projection": {
  //                    "ProjectionType": "ALL",
  //                  },
  //                },
  //              },
  //            ],
  //          },
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  // });
  //
  // it('should delete a GSI from an existing table', async () => {
  //   // Create with a GSI.
  //   DynamoDBClientMock.on(CreateTableCommand).resolves({
  //     TableDescription: {
  //       LatestStreamArn: STREAM_ARN,
  //       TableArn: TABLE_ARN,
  //       TableId: TABLE_ID,
  //       TableStatus: 'ACTIVE',
  //     },
  //   });
  //   DynamoDBClientMock.on(DescribeTableCommand).resolves(
  //     makeDescribeTableResponse({
  //       gsis: [
  //         {
  //           IndexName: 'gsi-email',
  //           IndexStatus: 'ACTIVE',
  //           KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
  //           Projection: { ProjectionType: 'ALL' },
  //         },
  //       ],
  //       streamEnabled: true,
  //       streamViewType: 'NEW_AND_OLD_IMAGES',
  //       streamArn: STREAM_ARN,
  //     }),
  //   );
  //
  //   const { app: appCreate } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [
  //         { AttributeName: 'pk', AttributeType: 'S' },
  //         { AttributeName: 'email', AttributeType: 'S' },
  //       ],
  //       GlobalSecondaryIndexes: [
  //         {
  //           IndexName: 'gsi-email',
  //           KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
  //           Projection: { ProjectionType: 'ALL' },
  //         },
  //       ],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  //
  //   // Remove the GSI.
  //   DynamoDBClientMock.on(DescribeTableCommand).resolves(
  //     makeDescribeTableResponse({ streamEnabled: true, streamViewType: 'NEW_AND_OLD_IMAGES', streamArn: STREAM_ARN }),
  //   );
  //
  //   const { app: appDeleteGsi } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
  //       KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
  //       region: stub('${{testModule.model.region}}'),
  //       StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultDeleteGsi = await testModuleContainer.commit(appDeleteGsi, { enableResourceCapture: true });
  //   expect(resultDeleteGsi.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "update",
  //          "field": "properties",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": {
  //            "GlobalSecondaryIndexDiffs": [
  //              {
  //                "action": "delete",
  //                "properties": {
  //                  "IndexName": "gsi-email",
  //                  "KeySchema": [
  //                    {
  //                      "AttributeName": "email",
  //                      "KeyType": "HASH",
  //                    },
  //                  ],
  //                  "Projection": {
  //                    "ProjectionType": "ALL",
  //                  },
  //                },
  //              },
  //            ],
  //          },
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  // });
  //
  // // -------------------------------------------------------------------------
  // // Local Secondary Indexes
  // // -------------------------------------------------------------------------
  //
  // it('should create table with LSI', async () => {
  //   DynamoDBClientMock.on(DescribeTableCommand).resolves(
  //     makeDescribeTableResponse({
  //       lsis: [
  //         {
  //           IndexName: 'lsi-created',
  //           KeySchema: [
  //             { AttributeName: 'pk', KeyType: 'HASH' },
  //             { AttributeName: 'created', KeyType: 'RANGE' },
  //           ],
  //           Projection: { ProjectionType: 'ALL' },
  //         },
  //       ],
  //     }),
  //   );
  //
  //   const { app: appCreate } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [
  //         { AttributeName: 'pk', AttributeType: 'S' },
  //         { AttributeName: 'sk', AttributeType: 'S' },
  //         { AttributeName: 'created', AttributeType: 'N' },
  //       ],
  //       KeySchema: [
  //         { AttributeName: 'pk', KeyType: 'HASH' },
  //         { AttributeName: 'sk', KeyType: 'RANGE' },
  //       ],
  //       LocalSecondaryIndexes: [
  //         {
  //           IndexName: 'lsi-created',
  //           KeySchema: [
  //             { AttributeName: 'pk', KeyType: 'HASH' },
  //             { AttributeName: 'created', KeyType: 'RANGE' },
  //           ],
  //           Projection: { ProjectionType: 'ALL' },
  //         },
  //       ],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  //   expect(resultCreate.resourceDiffs).toMatchInlineSnapshot(`
  //    [
  //      [
  //        {
  //          "action": "add",
  //          "field": "resourceId",
  //          "node": "@octo/dynamodb=dynamodb-test-table",
  //          "value": "@octo/dynamodb=dynamodb-test-table",
  //        },
  //      ],
  //      [],
  //    ]
  //   `);
  // });
  //
  // it('should reject changing an LSI on an existing table', async () => {
  //   // Create with an LSI.
  //   DynamoDBClientMock.on(DescribeTableCommand).resolves(
  //     makeDescribeTableResponse({
  //       lsis: [
  //         {
  //           IndexName: 'lsi-created',
  //           KeySchema: [
  //             { AttributeName: 'pk', KeyType: 'HASH' },
  //             { AttributeName: 'created', KeyType: 'RANGE' },
  //           ],
  //           Projection: { ProjectionType: 'ALL' },
  //         },
  //       ],
  //     }),
  //   );
  //
  //   const { app: appCreate } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [
  //         { AttributeName: 'pk', AttributeType: 'S' },
  //         { AttributeName: 'sk', AttributeType: 'S' },
  //         { AttributeName: 'created', AttributeType: 'N' },
  //       ],
  //       KeySchema: [
  //         { AttributeName: 'pk', KeyType: 'HASH' },
  //         { AttributeName: 'sk', KeyType: 'RANGE' },
  //       ],
  //       LocalSecondaryIndexes: [
  //         {
  //           IndexName: 'lsi-created',
  //           KeySchema: [
  //             { AttributeName: 'pk', KeyType: 'HASH' },
  //             { AttributeName: 'created', KeyType: 'RANGE' },
  //           ],
  //           Projection: { ProjectionType: 'ALL' },
  //         },
  //       ],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //   await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  //
  //   // Attempt to change the LSI projection — must throw.
  //   const { app: appChangeLsi } = await setup(testModuleContainer);
  //   await testModuleContainer.runModule<AwsDynamoDBServiceModule>({
  //     inputs: {
  //       AttributeDefinitions: [
  //         { AttributeName: 'pk', AttributeType: 'S' },
  //         { AttributeName: 'sk', AttributeType: 'S' },
  //         { AttributeName: 'created', AttributeType: 'N' },
  //       ],
  //       KeySchema: [
  //         { AttributeName: 'pk', KeyType: 'HASH' },
  //         { AttributeName: 'sk', KeyType: 'RANGE' },
  //       ],
  //       LocalSecondaryIndexes: [
  //         {
  //           IndexName: 'lsi-created',
  //           KeySchema: [
  //             { AttributeName: 'pk', KeyType: 'HASH' },
  //             { AttributeName: 'created', KeyType: 'RANGE' },
  //           ],
  //           Projection: { ProjectionType: 'KEYS_ONLY' },
  //         },
  //       ],
  //       region: stub('${{testModule.model.region}}'),
  //       TableName: 'test-table',
  //     },
  //     moduleId: 'service',
  //     type: AwsDynamoDBServiceModule,
  //   });
  //
  //   await expect(testModuleContainer.commit(appChangeLsi, { enableResourceCapture: true })).rejects.toThrow(
  //     'Cannot update DynamoDB immutable properties once it has been created!',
  //   );
  // });
});
