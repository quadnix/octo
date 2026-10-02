import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DescribeImagesCommand, ECRClient, GetAuthorizationTokenCommand } from '@aws-sdk/client-ecr';
import { jest } from '@jest/globals';
import { type Image, type Region, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsRegionAnchorSchema } from '../../../../src/anchors/aws-region/aws-region.anchor.schema.js';
import { AwsEcrImageModule } from '../../../../src/modules/image/aws-ecr-image/index.js';
import { AwsEcrImageTagModule } from '../../../../src/modules/image/aws-ecr-image-tag/index.js';
import { DockerService } from '../../../../src/services/docker/docker.service.js';
import { config } from '../../../test.config.js';
import { TerragruntUtility } from '../../../utilities/terragrunt/terragrunt.utility.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

const AUTHORIZATION_TOKEN = Buffer.from('AWS:password').toString('base64');

/**
 * The docker CLI and the ECR API the image tag resource reaches for. A published tag is an external
 * resource, so it runs for real even in a plan-only run, where the repository it pushes into exists
 * only as a terragrunt mock output.
 */
function createPublishingMocks(): { mocks: Parameters<typeof TestContainer.create>[0]['mocks'] } {
  return {
    mocks: [
      { type: DockerService, value: { build: jest.fn(), login: jest.fn(), push: jest.fn() } },
      {
        metadata: { package: '@octo' },
        type: ECRClient,
        value: {
          send: jest.fn(async (command: unknown) => {
            if (command instanceof GetAuthorizationTokenCommand) {
              return {
                authorizationData: [{ authorizationToken: AUTHORIZATION_TOKEN, proxyEndpoint: 'https://registry' }],
              };
            }
            if (command instanceof DescribeImagesCommand) {
              return { imageDetails: [{ imageDigest: 'sha256:0123456789abcdef' }] };
            }
            return {};
          }),
        },
      },
    ],
  };
}

async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  const {
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
}

describe('AwsEcrImageTagModule E2E', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(createPublishingMocks(), { factoryTimeoutInMs: 500 });

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

  it('should generate terragrunt for a tag published after its repository that plans against AWS', async () => {
    await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsEcrImageModule | AwsEcrImageTagModule>(
        [
          {
            inputs: {
              imageFamily: 'family',
              imageName: 'image',
              regions: [stub<Region>('${{testModule.model.region}}')],
            },
            moduleId: 'image',
            type: AwsEcrImageModule,
          },
          {
            inputs: {
              architecture: 'arm64',
              dockerfileDirectory: 'images/nginx',
              image: stub<Image>('${{image.model.image}}'),
              imageTag: '0.0.1',
            },
            moduleId: 'image-tag',
            type: AwsEcrImageTagModule,
          },
        ],
        { outputDir: OUTPUT_DIR, terraformTarget: 'plan' },
      )
      .next();

    expect(await TerragruntUtility.collectTerraformResources(OUTPUT_DIR)).toMatchInlineSnapshot(`
     [
       "aws_ecr_repository.ecr-us-east-1-family_image",
       "null_resource.ecr-image-tag-us-east-1-family_image-0-0-1",
     ]
    `);
  }, 300_000);
});
