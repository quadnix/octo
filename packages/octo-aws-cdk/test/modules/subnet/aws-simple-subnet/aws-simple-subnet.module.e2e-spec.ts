import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Account,
  type App,
  type Filesystem,
  type Region,
  TerraformUtility,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsEfsAnchorSchema } from '../../../../src/anchors/aws-efs/aws-efs.anchor.schema.js';
import type { AwsRegionAnchorSchema } from '../../../../src/anchors/aws-region/aws-region.anchor.schema.js';
import { AwsSimpleSubnetModule } from '../../../../src/modules/subnet/aws-simple-subnet/index.js';
import type { EfsSchema } from '../../../../src/resources/efs/index.schema.js';
import type { InternetGatewaySchema } from '../../../../src/resources/internet-gateway/index.schema.js';
import type { VpcSchema } from '../../../../src/resources/vpc/index.schema.js';
import { config } from '../../../test.config.js';

const { AWS_ACCOUNT_ID, AWS_REGION_ID } = config;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'generated');

async function setup(
  testModuleContainer: TestModuleContainer,
): Promise<{ account: Account; app: App; filesystem: Filesystem; region: Region }> {
  const {
    account: [account],
    app: [app],
    filesystem: [filesystem],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: [`aws,${AWS_ACCOUNT_ID}`],
    app: ['test-app'],
    filesystem: ['test-filesystem'],
    region: ['region'],
  });

  filesystem.addAnchor(
    testModuleContainer.createTestAnchor<AwsEfsAnchorSchema>(
      'AwsEfsAnchor',
      { filesystemName: 'test-filesystem' },
      filesystem,
    ),
  );
  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      {
        awsRegionAZs: ['us-east-1a', 'us-east-1b'],
        awsRegionId: 'us-east-1',
        regionId: 'aws-us-east-1a',
        vpcCidrBlock: '10.0.0.0/16',
      },
      region,
    ),
  );

  await testModuleContainer.createTestResources<[EfsSchema, InternetGatewaySchema, VpcSchema]>(
    'testModule',
    [
      {
        properties: { awsAccountId: AWS_ACCOUNT_ID, awsRegionId: 'us-east-1', filesystemName: 'test-filesystem' },
        resourceContext: '@octo/efs=efs-region-test-filesystem',
        response: { FileSystemArn: 'FileSystemArn', FileSystemId: 'FileSystemId' },
        terraform: true,
      },
      {
        properties: { awsAccountId: AWS_ACCOUNT_ID, awsRegionId: 'us-east-1', internetGatewayName: 'default' },
        resourceContext: '@octo/internet-gateway=igw-region',
        response: { InternetGatewayId: 'InternetGatewayId' },
        terraform: true,
      },
      {
        properties: {
          awsAccountId: AWS_ACCOUNT_ID,
          awsAvailabilityZones: ['us-east-1a'],
          awsRegionId: 'us-east-1',
          CidrBlock: '10.0.0.0/16',
          InstanceTenancy: 'default',
        },
        resourceContext: '@octo/vpc=vpc-region',
        response: { VpcId: 'VpcId' },
        terraform: true,
      },
    ],
    { save: true },
  );

  return { account, app, filesystem, region };
}

describe('AwsSimpleSubnetModule E2E', () => {
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
    await testModuleContainer.runModule<AwsSimpleSubnetModule>({
      inputs: {
        localFilesystems: [stub('${{testModule.model.filesystem}}')],
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet',
      type: AwsSimpleSubnetModule,
    });

    const { outputDir } = await testModuleContainer.generateHcl(app, { outputDir: OUTPUT_DIR });

    await terraformUtility.validate(outputDir);
    await terraformUtility.plan(outputDir);
  }, 300_000);
});
