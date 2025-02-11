import { IAMClient } from '@aws-sdk/client-iam';
import { S3Client } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import {
  type Account,
  type App,
  type Service,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { S3DirectoryAnchor } from '../../../anchors/s3-directory/s3-directory.anchor.js';
import { S3StorageAnchor } from '../../../anchors/s3-storage/s3-storage.anchor.js';
import type { IamRoleSchema } from '../../../resources/iam-role/iam-role.schema.js';
import { S3Storage } from '../../../resources/s3-storage/index.js';
import { AwsServerModule } from './aws-server.module.js';
import { S3StorageAccess } from './index.schema.js';

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

  service.addAnchor(
    new S3DirectoryAnchor(
      'S3DirectoryAnchor-1234',
      { bucketName: 'test-bucket', remoteDirectoryPath: 'uploads' },
      service,
    ),
  );
  service.addAnchor(
    new S3StorageAnchor(
      'S3StorageAnchor',
      { awsAccountId: '123', awsRegionId: 'us-east-1', bucketName: 'test-bucket' },
      service,
    ),
  );

  const s3Storage = new S3Storage('bucket-test-bucket', {
    awsAccountId: '123',
    awsRegionId: 'us-east-1',
    Bucket: 'test-bucket',
  });
  await testModuleContainer.createResources('testModule', [s3Storage], { save: true });

  return { account, app, service };
}

describe('AwsServerModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create(
      {
        mocks: [
          {
            metadata: { package: '@octo' },
            type: IAMClient,
            value: {
              send: (): void => {
                throw new Error('Trying to execute real AWS resources in mock mode!');
              },
            },
          },
          {
            metadata: { package: '@octo' },
            type: S3Client,
            value: {
              send: (): void => {
                throw new Error('Trying to execute real AWS resources in mock mode!');
              },
            },
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());

    // Register resource captures.
    testModuleContainer.registerCapture<IamRoleSchema>('@octo/iam-role=iam-role-ServerRole-backend', {
      Arn: 'Arn',
      policies: {
        'server-s3-access-overlay-56043e0e95bf': ['server-s3-access-arn'],
      },
      RoleId: 'RoleId',
      RoleName: 'RoleName',
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        s3: [
          {
            directories: [{ access: S3StorageAccess.READ, remoteDirectoryPath: 'uploads' }],
            service: stub('${{testModule.model.service}}'),
          },
        ],
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsServerModule,
    });

    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['server'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddServerModelAction",
       ],
       [
         "AddAwsServerS3AccessOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddIamRoleResourceAction",
         "UpdateIamRoleWithAwsPolicyResourceAction",
         "UpdateIamRoleWithS3StoragePolicyResourceAction",
       ],
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: app1 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsServerModule,
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
           },
         },
       ],
       [],
     ]
    `);

    // Adding security groups should have no effect as they are not created until execution.
    const { app: app2 } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsServerModule>({
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
      type: AwsServerModule,
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
    await testModuleContainer.runModule<AwsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        s3: [
          {
            directories: [{ access: S3StorageAccess.READ, remoteDirectoryPath: 'uploads' }],
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
      type: AwsServerModule,
    });
    const result3 = await testModuleContainer.commit(app3, { enableResourceCapture: true });
    expect(result3.resourceDiffs).toMatchInlineSnapshot(`
     [
       [
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
             "policyId": "server-s3-access-overlay-56043e0e95bf",
           },
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
           },
         },
         {
           "action": "update",
           "field": "s3-storage-access-policy",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": {
             "action": "delete",
             "policyId": "server-s3-access-overlay-56043e0e95bf",
           },
         },
         {
           "action": "delete",
           "field": "resourceId",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": "@octo/iam-role=iam-role-ServerRole-backend",
         },
       ],
       [],
     ]
    `);
  });
});
