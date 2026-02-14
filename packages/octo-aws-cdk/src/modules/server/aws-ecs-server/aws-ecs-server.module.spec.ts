import {
  CreatePolicyCommand,
  CreateRoleCommand,
  GetRoleCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { S3Client } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import { type Account, type App, type Service, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import type { AwsS3StorageServiceDirectoryAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service-directory.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
// eslint-disable-next-line boundaries/element-types
import { S3Storage } from '../../../resources/s3-storage/index.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { AwsEcsServerS3AccessDirectoryPermission } from './index.schema.js';
import { AwsEcsServerModule } from './index.js';

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; service: Service }> {
  const {
    account: [account],
    app: [app],
    service: [service],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    service: [['test-bucket', { bucketName: 'test-bucket' }]],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>('AwsAccountAnchor', { awsAccountId: '123' }, account),
  );

  service.addAnchor(
    testModuleContainer.createTestAnchor<AwsS3StorageServiceDirectoryAnchorSchema>(
      'AwsS3StorageServiceDirectoryAnchor-1234',
      { bucketName: 'test-bucket', remoteDirectoryPath: 'uploads' },
      service,
    ),
  );
  service.addAnchor(
    testModuleContainer.createTestAnchor<AwsS3StorageServiceAnchorSchema>(
      'AwsS3StorageServiceAnchor',
      { awsAccountId: '123', awsRegionId: 'us-east-1', bucketName: 'test-bucket' },
      service,
    ),
  );

  const s3Storage = new S3Storage('bucket-test-bucket', {
    awsAccountId: '123',
    awsRegionId: 'us-east-1',
    Bucket: 'test-bucket',
    permissions: [],
  });
  await testModuleContainer.createResources('testModule', [s3Storage], { save: true });

  return { account, app, service };
}

describe('AwsEcsServerModule UT', () => {
  const originalRetryPromise = RetryUtility.retryPromise;

  let retryPromiseSpy: jest.Spied<any>;
  let testModuleContainer: TestModuleContainer;

  const IAMClientMock = mockClient(IAMClient);
  const ResourceGroupsTaggingAPIClientMock = mockClient(ResourceGroupsTaggingAPIClient);
  const S3ClientMock = mockClient(S3Client);

  beforeEach(async () => {
    IAMClientMock.on(CreateRoleCommand)
      .resolves({
        Role: {
          Arn: 'arn:aws:iam::123:role/RoleName',
          CreateDate: new Date(),
          Path: 'Path',
          RoleId: 'RoleId',
          RoleName: 'RoleName',
        },
      })
      .on(GetRoleCommand)
      .resolves({
        Role: {
          Arn: 'arn:aws:iam::123:role/RoleName',
          CreateDate: new Date(),
          Path: 'Path',
          RoleId: 'RoleId',
          RoleName: 'RoleName',
        },
      })
      .on(CreatePolicyCommand)
      .resolves({
        Policy: {
          Arn: 'arn:aws:iam::123:policy/PolicyName',
        },
      })
      .on(ListAttachedRolePoliciesCommand)
      .resolves({ AttachedPolicies: [] });

    ResourceGroupsTaggingAPIClientMock.on(TagResourcesCommand).resolves({}).on(UntagResourcesCommand).resolves({});

    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: IAMClient,
            value: IAMClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: ResourceGroupsTaggingAPIClient,
            value: ResourceGroupsTaggingAPIClientMock,
          },
          {
            metadata: { package: '@octo' },
            type: S3Client,
            value: S3ClientMock,
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
    IAMClientMock.restore();
    ResourceGroupsTaggingAPIClientMock.restore();
    S3ClientMock.restore();

    await testModuleContainer.reset();
    await TestContainer.reset();

    retryPromiseSpy.mockReset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        s3: [
          {
            directories: [{ access: AwsEcsServerS3AccessDirectoryPermission.READ, remoteDirectoryPath: 'uploads' }],
            service: stub('${{testModule.model.service}}'),
          },
        ],
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['server'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsEcsServerModelAction",
       ],
       [
         "AddAwsEcsServerS3AccessOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddIamRoleResourceAction",
       ],
       [
         "UpdateIamRoleWithAwsPolicyResourceAction",
         "UpdateIamRoleWithS3StoragePolicyResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": "@octo/iam-role=iam-role-ServerRole-backend",
         },
         {
           "action": "update",
           "field": "aws-policy",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": {
             "action": "add",
             "policy": "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
             "policyId": "AmazonECSTaskExecutionRolePolicy",
             "policyType": "aws-policy",
           },
         },
       ],
       [],
     ]
    `);

    // Adding security groups should have no effect as they are not created until execution.
    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        securityGroupRules: [
          {
            CidrBlock: '0.0.0.0/0',
            Egress: true,
            FromPort: 0,
            IpProtocol: 'tcp',
            ToPort: 65535,
          },
        ],
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [],
       [],
     ]
    `);

    // Add S3 Storage.
    const { app: app3 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        s3: [
          {
            directories: [{ access: AwsEcsServerS3AccessDirectoryPermission.READ, remoteDirectoryPath: 'uploads' }],
            service: stub('${{testModule.model.service}}'),
          },
        ],
        securityGroupRules: [
          {
            CidrBlock: '0.0.0.0/0',
            Egress: true,
            FromPort: 0,
            IpProtocol: 'tcp',
            ToPort: 65535,
          },
        ],
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "s3-storage-access-policy",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": {
             "action": "add",
             "policy": {
               "allowRead": true,
               "allowWrite": false,
               "bucketName": "test-bucket",
               "remoteDirectoryPath": "uploads",
             },
             "policyId": "aws-ecs-server-s3-access-overlay-e9dc96db328e",
             "policyType": "s3-storage-access-policy",
           },
         },
         {
           "action": "update",
           "field": "update-permissions",
           "node": "@octo/s3-storage=bucket-test-bucket",
           "value": {
             "uploads": {
               "iam-role-ServerRole-backend": "addDirectoryPermissions",
             },
           },
         },
         {
           "action": "add",
           "field": "parent",
           "node": "@octo/s3-storage=bucket-test-bucket",
           "value": "@octo/iam-role=iam-role-ServerRole-backend",
         },
       ],
       [],
     ]
    `);

    const { app: app4 } = await setup(testModuleContainer);
    const result4 = await testModuleContainer.commit(app4, { enableResourceCapture: true });
    expect(result4.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "aws-policy",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": {
             "action": "delete",
             "policyId": "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
             "policyType": "aws-policy",
           },
         },
         {
           "action": "update",
           "field": "s3-storage-access-policy",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": {
             "action": "delete",
             "policyId": "aws-ecs-server-s3-access-overlay-e9dc96db328e",
             "policyType": "s3-storage-access-policy",
           },
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": "@octo/iam-role=iam-role-ServerRole-backend",
         },
         {
           "action": "update",
           "field": "update-permissions",
           "node": "@octo/s3-storage=bucket-test-bucket",
           "value": {
             "uploads": {
               "iam-role-ServerRole-backend": "deleteDirectoryPermissions",
             },
           },
         },
         {
           "action": "delete",
           "field": "parent",
           "node": "@octo/s3-storage=bucket-test-bucket",
           "value": "@octo/iam-role=iam-role-ServerRole-backend",
         },
       ],
       [],
     ]
    `);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const result1 = await testModuleContainer.commit(app1, { enableResourceCapture: true });
    expect(result1.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "add",
           "field": "resourceId",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": "@octo/iam-role=iam-role-ServerRole-backend",
         },
         {
           "action": "update",
           "field": "aws-policy",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": {
             "action": "add",
             "policy": "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
             "policyId": "AmazonECSTaskExecutionRolePolicy",
             "policyType": "aws-policy",
           },
         },
       ],
       [],
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const result2 = await testModuleContainer.commit(app2, { enableResourceCapture: true });
    expect(result2.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
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
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
         {
           "action": "update",
           "field": "tags",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
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
