import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HclUtility, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsServerlessRegionAnchorSchema } from '../../../../src/anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsServerlessSubnetModule } from '../../../../src/modules/subnet/aws-serverless-subnet/index.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: [`aws,${AWS_ACCOUNT_ID}`],
    app: ['test-app'],
    region: ['region'],
  });

  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsServerlessRegionAnchorSchema>(
      'AwsServerlessRegionAnchor',
      { awsRegionId: AWS_REGION_ID, regionId: 'region', serverless: true },
      region,
    ),
  );
}

describe('AwsServerlessSubnetModule E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
    testModuleContainer.registerTerraformProvider('aws', AWS_ACCOUNT_ID, AWS_REGION_ID);
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should generate no terragrunt, since a serverless subnet creates no resources', async () => {
    await setup(testModuleContainer);
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsServerlessSubnetModule>(
          {
            inputs: { region: stub('${{testModule.model.region}}') },
            moduleId: 'subnet',
            type: AwsServerlessSubnetModule,
          },
          { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
        )
        .next()
    ).value!;

    expect(Object.keys(HclUtility.parse(hclRender).resource)).toEqual([]);
  }, 300_000);
});
