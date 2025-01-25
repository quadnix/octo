import { IAMClient } from '@aws-sdk/client-iam';
import { S3Client } from '@aws-sdk/client-s3';
import { jest } from '@jest/globals';
import {
  AAnchor,
  type Account,
  Anchor,
  type App,
  Model,
  Service,
  TestContainer,
  TestModuleContainer,
  TestStateProvider,
  stub,
} from '@quadnix/octo';
import { type IamRoleSchema } from '../../../resources/iam-role/index.js';
import { S3Storage } from '../../../resources/s3-storage/index.js';
import {
  AwsS3DirectoryAnchorSchema,
  AwsS3StorageServiceSchema,
  AwsServerModule,
  S3StorageAccess,
} from './aws-server.module.js';

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
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create(
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
         "UpdateIamRoleAssumeRolePolicyResourceAction",
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
