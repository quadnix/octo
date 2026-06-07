import {
  type Account,
  type App,
  DiffAssert,
  type Service,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import type { AwsS3StorageServiceDirectoryAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service-directory.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { S3Storage } from '../../../resources/s3-storage/index.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
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
  let hcl: HclAssert;
  let octoTerraform: OctoTerraform;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(
      { mocks: [{ metadata: { package: '@octo' }, type: OctoTerraform, value: new OctoTerraform() }] },
      { factoryTimeoutInMs: 500 },
    );
    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();

    octoTerraform = await container.get(OctoTerraform, { metadata: { package: '@octo' } });
    octoTerraform.addTerraformConfig();
    octoTerraform.addTerraformProvider('123', 'us-east-1');

    hcl = new HclAssert(octoTerraform);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
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
         "CaptureIamRoleResponseResourceAction",
       ],
       [
         "CaptureIamRoleResponseResourceAction",
         "CaptureIamRoleResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/iam-role=iam-role-ServerRole-backend",
     ]
    `);
    /* eslint-disable spellcheck/spell-checker */
    expect(octoTerraform.render()).toMatchInlineSnapshot(`
     "terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source  = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "123-us-east-1"
       region = "us-east-1"
     }

     resource "aws_iam_role" "iam-role-ServerRole-backend" {
       provider = aws.123-us-east-1
       assume_role_policy = jsonencode({
         Statement = [{
             Action = "sts:AssumeRole"
             Effect = "Allow"
             Principal = {
               Service = "ecs-tasks.amazonaws.com"
             }
           }]
         Version = "2012-10-17"
       })
       name = "ServerRole-backend"
     }

     resource "aws_iam_role_policy_attachment" "iam-role-ServerRole-backend_AmazonECSTaskExecutionRolePolicy" {
       provider = aws.123-us-east-1
       policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
       role = aws_iam_role.iam-role-ServerRole-backend.name

       depends_on = [aws_iam_role.iam-role-ServerRole-backend]
     }

     resource "aws_iam_policy" "iam-role-ServerRole-backend_aws-ecs-server-s3-access-overlay-e9dc96db328e" {
       provider = aws.123-us-east-1
       name = "aws-ecs-server-s3-access-overlay-e9dc96db328e"
       policy = jsonencode({
         Statement = [{
             Action = ["s3:GetObject", "s3:GetObjectAttributes", "s3:GetObjectTagging", "s3:GetObjectVersionAcl", "s3:GetObjectVersionAttributes", "s3:GetObjectVersionTagging", "s3:ListBucket"]
             Effect = "Allow"
             Resource = ["arn:aws:s3:::test-bucket/uploads", "arn:aws:s3:::test-bucket/uploads/*"]
             Sid = "Allowreadfrombuckettestbucket"
           }]
         Version = "2012-10-17"
       })

       depends_on = [aws_iam_role_policy_attachment.iam-role-ServerRole-backend_AmazonECSTaskExecutionRolePolicy]
     }

     resource "aws_iam_role_policy_attachment" "iam-role-ServerRole-backend_aws-ecs-server-s3-access-overlay-e9dc96db328e_attach" {
       provider = aws.123-us-east-1
       policy_arn = aws_iam_policy.iam-role-ServerRole-backend_aws-ecs-server-s3-access-overlay-e9dc96db328e.arn
       role = aws_iam_role.iam-role-ServerRole-backend.name

       depends_on = [aws_iam_policy.iam-role-ServerRole-backend_aws-ecs-server-s3-access-overlay-e9dc96db328e]
     }

     output "iam-role-ServerRole-backend-Arn" {
       value = aws_iam_role.iam-role-ServerRole-backend.arn
     }

     output "iam-role-ServerRole-backend-RoleId" {
       value = aws_iam_role.iam-role-ServerRole-backend.unique_id
     }

     output "iam-role-ServerRole-backend-RoleName" {
       value = aws_iam_role.iam-role-ServerRole-backend.name
     }

     resource "aws_s3_bucket" "bucket-test-bucket" {
       provider = aws.123-us-east-1
       bucket = "test-bucket"
     }

     resource "aws_s3_bucket_policy" "bucket-test-bucket-policy" {
       provider = aws.123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket.id
       policy = jsonencode({
         Statement = [{
             Action = ["s3:GetObject"]
             Effect = "Allow"
             Principal = {
               AWS = [aws_iam_role.iam-role-ServerRole-backend.arn]
             }
             Resource = ["arn:aws:s3:::test-bucket/uploads", "arn:aws:s3:::test-bucket/uploads/*"]
             Sid = "iamroleServerRolebackendReadPermission"
           }]
         Version = "2012-10-17"
       })

       depends_on = [aws_s3_bucket.bucket-test-bucket]
     }

     output "bucket-test-bucket-Arn" {
       value = aws_s3_bucket.bucket-test-bucket.arn
     }"
    `);
    /* eslint-enable */
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/iam-role=iam-role-ServerRole-backend",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    // Adding security groups should have no effect as they are not created until execution.
    const { app: appAddSecurityGroups } = await setup(testModuleContainer);
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
    const resultAddSecurityGroups = await testModuleContainer.commit(appAddSecurityGroups, {
      enableResourceCapture: true,
    });
    expect(new DiffAssert(resultAddSecurityGroups.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();

    // Add S3 Storage.
    const { app: appAddS3Storage } = await setup(testModuleContainer);
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
    const resultAddS3Storage = await testModuleContainer.commit(appAddS3Storage, { enableResourceCapture: true });
    expect(new DiffAssert(resultAddS3Storage.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/iam-role=iam-role-ServerRole-backend",
       "- @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/iam-role=iam-role-ServerRole-backend",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ServerRole-backend",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ServerRole-backend",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();
  });

  describe('input changes', () => {
    it('should handle serverKey change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsServerModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          serverKey: 'backend',
        },
        moduleId: 'server',
        type: AwsEcsServerModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateServerKey } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsServerModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          serverKey: 'changed-backend',
        },
        moduleId: 'server',
        type: AwsEcsServerModule,
      });
      const resultUpdateServerKey = await testModuleContainer.commit(appUpdateServerKey, {
        enableResourceCapture: true,
      });
      expect(new DiffAssert(resultUpdateServerKey.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "* @octo/iam-role=iam-role-ServerRole-backend",
         "- @octo/iam-role=iam-role-ServerRole-backend",
         "+ @octo/iam-role=iam-role-ServerRole-changed-backend",
         "* @octo/iam-role=iam-role-ServerRole-changed-backend",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server-1',
      type: AwsEcsServerModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server-2',
      type: AwsEcsServerModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();
  });
});
