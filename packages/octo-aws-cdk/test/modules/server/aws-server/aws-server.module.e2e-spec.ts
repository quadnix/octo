import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../../src/anchors/aws-account/aws-account.anchor.schema.js';
import type { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../../src/anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../../src/anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { AwsServerModule } from '../../../../src/modules/server/aws-server/index.js';
import { AwsServerAccessPermission } from '../../../../src/modules/server/aws-server/index.schema.js';
import { config } from '../../../test.config.js';
import { TerragruntUtility } from '../../../utilities/terragrunt/terragrunt.utility.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
    account: [account],
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
    testModuleContainer.createTestAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema>(
      'AwsS3StorageServiceAccessPrefixAnchor-1234',
      { accessPrefix: 'uploads', bucketName: 'test-bucket' },
      service,
    ),
  );
  service.addAnchor(
    testModuleContainer.createTestAnchor<AwsS3StorageServiceAnchorSchema>(
      'AwsS3StorageServiceAnchor',
      { awsAccountId: AWS_ACCOUNT_ID, awsRegionId: AWS_REGION_ID, bucketName: 'test-bucket', contentDigest: 'digest' },
      service,
    ),
  );
}

describe('AwsServerModule E2E', () => {
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

  it('should generate no terraform resources to run against AWS', async () => {
    await setup(testModuleContainer);
    const { resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsServerModule>(
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              s3: [
                {
                  accessPrefixes: [{ access: AwsServerAccessPermission.READ, accessPrefix: 'uploads' }],
                  service: stub('${{testModule.model.service}}'),
                },
              ],
              serverKey: 'backend',
            },
            moduleId: 'server',
            type: AwsServerModule,
          },
          { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
        )
        .next()
    ).value!;

    // The server and its grants are data only. The role holding the grants materializes once the
    // server is run by an execution, so generate emits nothing for terragrunt to run.
    expect(resourceDiffs.flat()).toHaveLength(0);
    expect(await TerragruntUtility.collectTerraformResources(OUTPUT_DIR)).toEqual([]);
  }, 300_000);
});
