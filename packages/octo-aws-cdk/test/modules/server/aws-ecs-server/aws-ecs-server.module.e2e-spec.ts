import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Account, type App, type Service, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../../src/anchors/aws-account/aws-account.anchor.schema.js';
import type { AwsS3StorageServiceDirectoryAnchorSchema } from '../../../../src/anchors/aws-s3-storage-service/aws-s3-storage-service-directory.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../../src/anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsEcsServerModule } from '../../../../src/modules/server/aws-ecs-server/index.js';
import { AwsEcsServerS3AccessDirectoryPermission } from '../../../../src/modules/server/aws-ecs-server/index.schema.js';
import { S3Storage } from '../../../../src/resources/s3-storage/index.js';
import { config } from '../../../test.config.js';
import { TerragruntUtility } from '../../../utilities/terragrunt/terragrunt.utility.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; service: Service }> {
  const {
    account: [account],
    app: [app],
    service: [service],
  } = await testModuleContainer.createTestModels('testModule', {
    account: [`aws,${AWS_ACCOUNT_ID}`],
    app: ['test-app'],
    service: [['test-bucket', { bucketName: 'test-bucket' }]],
  });

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>(
      'AwsAccountAnchor',
      { awsAccountId: AWS_ACCOUNT_ID },
      account,
    ),
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
      { awsAccountId: AWS_ACCOUNT_ID, awsRegionId: AWS_REGION_ID, bucketName: 'test-bucket' },
      service,
    ),
  );

  const s3Storage = new S3Storage('bucket-test-bucket', {
    awsAccountId: AWS_ACCOUNT_ID,
    awsRegionId: AWS_REGION_ID,
    Bucket: 'test-bucket',
    permissions: [],
  });
  await testModuleContainer.createResources('testModule', [s3Storage], { save: true });

  return { account, app, service };
}

describe('AwsEcsServerModule E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, AWS_REGION_ID);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should generate terragrunt that validates and plans against AWS', async () => {
    const { app } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcsServerModule>(
        app,
        {
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
        },
        { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
      )
      .next();

    expect(await TerragruntUtility.collectTerraformResources(OUTPUT_DIR)).toMatchInlineSnapshot(`
     [
       "aws_iam_role.iam-role-ServerRole-backend",
       "aws_iam_role_policy_attachment.iam-role-ServerRole-backend_AmazonECSTaskExecutionRolePolicy",
       "aws_iam_policy.iam-role-ServerRole-backend_aws-ecs-server-s3-access-overlay-e9dc96db328e",
       "aws_iam_role_policy_attachment.iam-role-ServerRole-backend_aws-ecs-server-s3-access-overlay-e9dc96db328e_attach",
       "aws_s3_bucket.bucket-test-bucket",
       "aws_s3_bucket_policy.bucket-test-bucket-policy",
     ]
    `);
  }, 300_000);
});
