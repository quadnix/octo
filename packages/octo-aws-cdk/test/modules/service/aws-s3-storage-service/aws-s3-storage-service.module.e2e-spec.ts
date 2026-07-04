import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Account,
  type App,
  type Region,
  TerraformUtility,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../../src/anchors/aws-region/aws-region.anchor.schema.js';
import { AwsS3StorageServiceModule } from '../../../../src/modules/service/aws-s3-storage-service/index.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; region: Region }> {
  const {
    account: [account],
    app: [app],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: [`aws,${AWS_ACCOUNT_ID}`],
    app: ['test-app'],
    region: ['region'],
  });

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: AWS_REGION_ID,
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  return { account, app, region };
}

describe('AwsS3StorageServiceModule E2E', () => {
  let terraformUtility: TerraformUtility;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();
    terraformUtility = await container.get(TerraformUtility);

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
    await testModuleContainer.runModule<AwsS3StorageServiceModule>({
      inputs: {
        bucketName: 'test-bucket',
        region: stub('${{testModule.model.region}}'),
        remoteDirectoryPaths: ['uploads'],
      },
      moduleId: 'service',
      type: AwsS3StorageServiceModule,
    });

    const { outputDir } = await testModuleContainer.generateHcl(app, { outputDir: OUTPUT_DIR });

    await terraformUtility.validate(outputDir);
    await terraformUtility.plan(outputDir);
  }, 300_000);
});
