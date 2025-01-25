import { IAMClient } from '@aws-sdk/client-iam';
import { S3Client } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import {
  AAnchor,
  type Account,
  Anchor,
  type App,
  type Container,
  Model,
  Service,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { AddIamRoleResourceAction } from '../../../resources/iam-role/actions/add-iam-role.resource.action.js';
import { UpdateIamRoleWithS3StoragePolicyResourceAction } from '../../../resources/iam-role/actions/update-iam-role-with-s3-storage-policy.resource.action.js';
import { type IamRoleSchema } from '../../../resources/iam-role/index.js';
import { UpdatePermissionsInS3StorageResourceAction } from '../../../resources/s3-storage/actions/update-permissions-in-s3-storage.resource.action.js';
import { S3Storage } from '../../../resources/s3-storage/index.js';
import {
  AwsS3DirectoryAnchorSchema,
  AwsS3StorageServiceSchema,
  AwsServerModule,
  S3StorageAccess,
} from './aws-server.module.js';
import { AddServerModelAction } from './models/server/actions/add-server.model.action.js';
import { AddAwsServerS3AccessOverlayAction } from './overlays/server-s3-access/actions/add-server-s3-access.overlay.action.js';

@Anchor('@octo')
class TestS3StorageDirectoryAnchor extends AAnchor<AwsS3DirectoryAnchorSchema, Service> {
  declare properties: AwsS3DirectoryAnchorSchema['properties'];

  constructor(anchorId: string, properties: AwsS3DirectoryAnchorSchema['properties'], parent: Service) {
    super(anchorId, properties, parent);
  }
}

@Model<TestS3StorageService>('@octo', 'service', AwsS3StorageServiceSchema)
class TestS3StorageService extends Service {
  readonly bucketName = 'test-bucket';

  readonly directories: { remoteDirectoryPath: string }[] = [];

  constructor() {
    super('test-bucket-s3-storage');
  }

  addDirectory(remoteDirectoryPath: string): void {
    const directoryAnchor = new TestS3StorageDirectoryAnchor(
      `TestS3StorageDirectoryAnchor-${remoteDirectoryPath}`,
      { bucketName: this.bucketName, remoteDirectoryPath: remoteDirectoryPath },
      this,
    );
    this.addAnchor(directoryAnchor);

    this.directories.push({ remoteDirectoryPath });
  }

  override synth(): AwsS3StorageServiceSchema {
    return {
      bucketName: this.bucketName,
      directories: JSON.parse(JSON.stringify(this.directories)),
      serviceId: this.serviceId,
    };
  }

  static override async unSynth(s3Storage: AwsS3StorageServiceSchema): Promise<TestS3StorageService> {
    const service = new TestS3StorageService();
    service.directories.push(...(s3Storage.directories || []));
    return service;
  }
}

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
    service: [[new TestS3StorageService()]],
  });
  jest.spyOn(account, 'getCredentials').mockReturnValue({});

  (service as TestS3StorageService).addDirectory('uploads');

  const s3Storage = new S3Storage('bucket-test-bucket', {
    awsAccountId: '123',
    awsRegionId: 'us-east-1',
    Bucket: 'test-bucket',
  });
  await testModuleContainer.createResources('testModule', [s3Storage], { save: true });

  return { account, app, service };
}

describe('AwsServerModule UT', () => {
  let container: Container;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            metadata: { awsAccountId: '123', awsRegionId: 'us-east-1', package: '@octo' },
            type: IAMClient,
            value: {
              send: (): void => {
                throw new Error('Trying to execute real AWS resources in mock mode!');
              },
            },
          },
          {
            metadata: { awsAccountId: '123', awsRegionId: 'us-east-1', package: '@octo' },
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
        'server-s3-access-overlay-e9dc96db328e': ['server-s3-access-arn'],
      },
      RoleId: 'RoleId',
      RoleName: 'RoleName',
    });
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call actions with correct inputs', async () => {
    const addServerModelAction = await container.get(AddServerModelAction);
    const addServerModelActionSpy = jest.spyOn(addServerModelAction, 'handle');
    const addAwsServerS3AccessOverlayAction = await container.get(AddAwsServerS3AccessOverlayAction);
    const addAwsServerS3AccessOverlayActionSpy = jest.spyOn(addAwsServerS3AccessOverlayAction, 'handle');
    const addIamRoleResourceAction = await container.get(AddIamRoleResourceAction);
    const addIamRoleResourceActionSpy = jest.spyOn(addIamRoleResourceAction, 'handle');
    const updateIamRoleWithS3StoragePolicyResourceAction = await container.get(
      UpdateIamRoleWithS3StoragePolicyResourceAction,
    );
    const updateIamRoleWithS3StoragePolicyResourceActionSpy = jest.spyOn(
      updateIamRoleWithS3StoragePolicyResourceAction,
      'handle',
    );
    const updatePermissionsInS3StorageResourceAction = await container.get(UpdatePermissionsInS3StorageResourceAction);
    const updatePermissionsInS3StorageResourceActionSpy = jest.spyOn(
      updatePermissionsInS3StorageResourceAction,
      'handle',
    );

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

    await testModuleContainer.commit(app, { enableResourceCapture: true });

    expect(addServerModelActionSpy).toHaveBeenCalledTimes(1);
    expect(addServerModelActionSpy.mock.calls[0][1]).toMatchInlineSnapshot(`
     {
       "inputs": {
         "account": {
           "accountId": "123",
           "accountType": "aws",
           "context": "account=123,app=test-app",
         },
         "s3": [
           {
             "directories": [
               {
                 "access": "READ",
                 "remoteDirectoryPath": "uploads",
               },
             ],
             "service": {
               "bucketName": "test-bucket",
               "context": "service=test-bucket-s3-storage,app=test-app",
               "directories": [
                 {
                   "remoteDirectoryPath": "uploads",
                 },
               ],
               "serviceId": "test-bucket-s3-storage",
             },
           },
         ],
         "securityGroupRules": [],
         "serverKey": "backend",
       },
       "metadata": {},
       "models": {
         "server": {
           "context": "server=backend,app=test-app",
           "serverKey": "backend",
         },
       },
       "overlays": {
         "server-s3-access-overlay-e9dc96db328e": {
           "anchors": [
             {
               "anchorId": "AwsIamRoleAnchor",
               "parent": {
                 "context": "server=backend,app=test-app",
               },
               "properties": {
                 "iamRoleName": "ServerRole-backend",
               },
             },
             {
               "anchorId": "TestS3StorageDirectoryAnchor-uploads",
               "parent": {
                 "context": "service=test-bucket-s3-storage,app=test-app",
               },
               "properties": {
                 "bucketName": "test-bucket",
                 "remoteDirectoryPath": "uploads",
               },
             },
           ],
           "context": "@octo/server-s3-access-overlay=server-s3-access-overlay-e9dc96db328e",
           "overlayId": "server-s3-access-overlay-e9dc96db328e",
           "properties": {
             "allowRead": true,
             "allowWrite": false,
             "bucketName": "test-bucket",
             "iamRoleName": "ServerRole-backend",
             "iamRolePolicyId": "server-s3-access-overlay-e9dc96db328e",
             "remoteDirectoryPath": "uploads",
           },
         },
       },
       "resources": {},
     }
    `);

    expect(addAwsServerS3AccessOverlayActionSpy).toHaveBeenCalledTimes(1);

    expect(addIamRoleResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(addIamRoleResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "add",
       "field": "resourceId",
       "node": "@octo/iam-role=iam-role-ServerRole-backend",
       "value": "@octo/iam-role=iam-role-ServerRole-backend",
     }
    `);

    expect(updateIamRoleWithS3StoragePolicyResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(updateIamRoleWithS3StoragePolicyResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
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
         "policyId": "server-s3-access-overlay-e9dc96db328e",
       },
     }
    `);

    expect(updatePermissionsInS3StorageResourceActionSpy).toHaveBeenCalledTimes(1);
    expect(updatePermissionsInS3StorageResourceActionSpy.mock.calls[0][0]).toMatchInlineSnapshot(`
     {
       "action": "update",
       "field": "update-permissions",
       "node": "@octo/s3-storage=bucket-test-bucket",
       "value": {
         "uploads": {
           "iam-role-ServerRole-backend": "addDirectoryPermissions",
         },
       },
     }
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
           "field": "assume-role-policy",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": {
             "action": "add",
             "policy": "ecs-tasks.amazonaws.com",
             "policyId": "AmazonECSTasksAssumeRolePolicy",
           },
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
             "policyId": "server-s3-access-overlay-e9dc96db328e",
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
           "field": "assume-role-policy",
           "node": "@octo/iam-role=iam-role-ServerRole-backend",
           "value": {
             "action": "delete",
             "policyId": "AmazonECSTasksAssumeRolePolicy",
           },
         },
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
             "policyId": "server-s3-access-overlay-e9dc96db328e",
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
