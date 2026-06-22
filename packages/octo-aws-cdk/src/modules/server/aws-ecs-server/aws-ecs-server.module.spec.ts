import { type Account, type App, type Service, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import type { AwsS3StorageServiceDirectoryAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service-directory.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { S3Storage } from '../../../resources/s3-storage/index.js';
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
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
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
    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`
     "# server/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
     }

     resource "aws_iam_role" "iam-role-ServerRole-backend" {
       provider = aws._123-us-east-1
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
       provider = aws._123-us-east-1
       policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
       role = aws_iam_role.iam-role-ServerRole-backend.name

       depends_on = [aws_iam_role.iam-role-ServerRole-backend]
     }

     resource "aws_iam_policy" "iam-role-ServerRole-backend_aws-ecs-server-s3-access-overlay-e9dc96db328e" {
       provider = aws._123-us-east-1
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
       provider = aws._123-us-east-1
       policy_arn = aws_iam_policy.iam-role-ServerRole-backend_aws-ecs-server-s3-access-overlay-e9dc96db328e.arn
       role = aws_iam_role.iam-role-ServerRole-backend.name

       depends_on = [aws_iam_policy.iam-role-ServerRole-backend_aws-ecs-server-s3-access-overlay-e9dc96db328e]
     }

     # server/outputs.tf
     output "iam-role-ServerRole-backend-Arn" {
       value = aws_iam_role.iam-role-ServerRole-backend.arn
     }

     output "iam-role-ServerRole-backend-RoleId" {
       value = aws_iam_role.iam-role-ServerRole-backend.unique_id
     }

     output "iam-role-ServerRole-backend-RoleName" {
       value = aws_iam_role.iam-role-ServerRole-backend.name
     }

     # server/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     # server/variables.tf
     <empty>

     # testModule/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
     }

     resource "aws_s3_bucket" "bucket-test-bucket" {
       provider = aws._123-us-east-1
       bucket = "test-bucket"
     }

     resource "aws_s3_bucket_policy" "bucket-test-bucket-policy" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket.id
       policy = jsonencode({
         Statement = [{
             Action = ["s3:GetObject"]
             Effect = "Allow"
             Principal = {
               AWS = [var.iam_role_ServerRole_backend_Arn]
             }
             Resource = ["arn:aws:s3:::test-bucket/uploads", "arn:aws:s3:::test-bucket/uploads/*"]
             Sid = "iamroleServerRolebackendReadPermission"
           }]
         Version = "2012-10-17"
       })

       depends_on = [aws_s3_bucket.bucket-test-bucket]
     }

     # testModule/outputs.tf
     output "bucket-test-bucket-Arn" {
       value = aws_s3_bucket.bucket-test-bucket.arn
     }

     # testModule/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     dependency "server" {
       config_path = "../server"

       mock_outputs = {
         "iam-role-ServerRole-backend-Arn" = "arn:aws:iam::000000000000:role/mock-role"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "validate"]
     }

     inputs = {
       iam_role_ServerRole_backend_Arn = dependency.server.outputs["iam-role-ServerRole-backend-Arn"]
     }

     # testModule/variables.tf
     variable "iam_role_ServerRole_backend_Arn" {}"
    `);

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['server'] });
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
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/iam-role=iam-role-ServerRole-backend",
     ]
    `);
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
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/iam-role=iam-role-ServerRole-backend",
     ]
    `);

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
    expect(await testModuleContainer.diffHcl(appAddSecurityGroups)).toMatchSnapshot();
    const resultAddSecurityGroups = await testModuleContainer.commit(appAddSecurityGroups);
    expect(testModuleContainer.digestDiffs(resultAddSecurityGroups.resourceDiffs)).toMatchInlineSnapshot(`[]`);

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
    expect(await testModuleContainer.diffHcl(appAddS3Storage)).toMatchSnapshot();
    const resultAddS3Storage = await testModuleContainer.commit(appAddS3Storage);
    expect(testModuleContainer.digestDiffs(resultAddS3Storage.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/iam-role=iam-role-ServerRole-backend",
       "- @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/iam-role=iam-role-ServerRole-backend",
       "* @octo/iam-role=iam-role-ServerRole-backend",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ServerRole-backend",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server',
      type: AwsEcsServerModule,
    });
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/iam-role=iam-role-ServerRole-backend",
     ]
    `);
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
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateServerKey } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsEcsServerModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          serverKey: 'changed-backend',
        },
        moduleId: 'server',
        type: AwsEcsServerModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdateServerKey)).toMatchSnapshot();
      const resultUpdateServerKey = await testModuleContainer.commit(appUpdateServerKey);
      expect(testModuleContainer.digestDiffs(resultUpdateServerKey.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/iam-role=iam-role-ServerRole-backend",
         "- @octo/iam-role=iam-role-ServerRole-backend",
         "+ @octo/iam-role=iam-role-ServerRole-changed-backend",
         "* @octo/iam-role=iam-role-ServerRole-changed-backend",
       ]
      `);
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
    await testModuleContainer.commit(appCreate);

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsEcsServerModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        serverKey: 'backend',
      },
      moduleId: 'server-2',
      type: AwsEcsServerModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateModuleId)).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });
});
