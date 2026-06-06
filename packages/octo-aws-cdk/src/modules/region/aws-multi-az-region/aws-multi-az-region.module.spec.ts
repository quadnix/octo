import { type Account, type App, DiffAssert, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsMultiAzRegionId } from './index.schema.js';
import { AwsMultiAzRegionModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
  } = await testModuleContainer.createTestModels('testModule', { account: ['aws,123'], app: ['test-app'] });

  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>('AwsAccountAnchor', { awsAccountId: '123' }, account),
  );

  return { account, app };
}

describe('AwsMultiAzRegionModule UT', () => {
  let hcl: HclAssert;
  let octoTerraform: OctoTerraform;
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create(
      {
        mocks: [{ metadata: { package: '@octo' }, type: OctoTerraform, value: new OctoTerraform() }],
      },
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
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['region'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsMultiAzRegionModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`
     [
       [
         "CaptureVpcResponseResourceAction",
       ],
       [
         "CaptureInternetGatewayResponseResourceAction",
       ],
     ]
    `);
    expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/vpc=vpc-test-region",
       "+ @octo/internet-gateway=igw-test-region",
     ]
    `);
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

     resource "aws_vpc" "vpc-test-region" {
       provider = aws.123-us-east-1
       cidr_block = "10.0.0.0/8"
       enable_dns_hostnames = true
       enable_dns_support = true
       instance_tenancy = "default"
     }

     output "vpc-test-region-VpcArn" {
       value = aws_vpc.vpc-test-region.arn
     }

     output "vpc-test-region-VpcId" {
       value = aws_vpc.vpc-test-region.id
     }

     resource "aws_internet_gateway" "igw-test-region" {
       provider = aws.123-us-east-1
       vpc_id = aws_vpc.vpc-test-region.id
     }

     output "igw-test-region-InternetGatewayArn" {
       value = aws_internet_gateway.igw-test-region.arn
     }

     output "igw-test-region-InternetGatewayId" {
       value = aws_internet_gateway.igw-test-region.id
     }"
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/vpc=vpc-test-region",
       "+ @octo/internet-gateway=igw-test-region",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.igw-test-region-InternetGatewayArn | blocks: 0 | properties: 1",
       "+ output.igw-test-region-InternetGatewayId | blocks: 0 | properties: 1",
       "+ output.vpc-test-region-VpcArn | blocks: 0 | properties: 1",
       "+ output.vpc-test-region-VpcId | blocks: 0 | properties: 1",
       "+ resource.aws_internet_gateway.igw-test-region | blocks: 0 | properties: 2",
       "+ resource.aws_vpc.vpc-test-region | blocks: 0 | properties: 5",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/vpc=vpc-test-region",
       "- @octo/internet-gateway=igw-test-region",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "- output.igw-test-region-InternetGatewayArn | blocks: 0 | properties: 1",
       "- output.igw-test-region-InternetGatewayId | blocks: 0 | properties: 1",
       "- output.vpc-test-region-VpcArn | blocks: 0 | properties: 1",
       "- output.vpc-test-region-VpcId | blocks: 0 | properties: 1",
       "- resource.aws_internet_gateway.igw-test-region | blocks: 0 | properties: 2",
       "- resource.aws_vpc.vpc-test-region | blocks: 0 | properties: 5",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/vpc=vpc-test-region",
       "+ @octo/internet-gateway=igw-test-region",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`
     [
       "+ output.igw-test-region-InternetGatewayArn | blocks: 0 | properties: 1",
       "+ output.igw-test-region-InternetGatewayId | blocks: 0 | properties: 1",
       "+ output.vpc-test-region-VpcArn | blocks: 0 | properties: 1",
       "+ output.vpc-test-region-VpcId | blocks: 0 | properties: 1",
       "+ resource.aws_internet_gateway.igw-test-region | blocks: 0 | properties: 2",
       "+ resource.aws_vpc.vpc-test-region | blocks: 0 | properties: 5",
     ]
    `);

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/vpc=vpc-test-region",
       "~ @octo/internet-gateway=igw-test-region",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsMultiAzRegionModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "~ @octo/vpc=vpc-test-region",
       "~ @octo/internet-gateway=igw-test-region",
     ]
    `);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);
  });

  describe('input changes', () => {
    it('should handle name change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'changed-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      const resultUpdateName = await testModuleContainer.commit(appUpdateName, { enableResourceCapture: true });
      expect(new DiffAssert(resultUpdateName.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "+ @octo/vpc=vpc-changed-region",
         "+ @octo/internet-gateway=igw-changed-region",
         "- @octo/vpc=vpc-test-region",
         "- @octo/internet-gateway=igw-test-region",
       ]
      `);
      expect(hcl.digest()).toMatchInlineSnapshot(`
       [
         "+ output.igw-changed-region-InternetGatewayArn | blocks: 0 | properties: 1",
         "+ output.igw-changed-region-InternetGatewayId | blocks: 0 | properties: 1",
         "+ output.vpc-changed-region-VpcArn | blocks: 0 | properties: 1",
         "+ output.vpc-changed-region-VpcId | blocks: 0 | properties: 1",
         "+ resource.aws_internet_gateway.igw-changed-region | blocks: 0 | properties: 2",
         "+ resource.aws_vpc.vpc-changed-region | blocks: 0 | properties: 5",
         "- output.igw-test-region-InternetGatewayArn | blocks: 0 | properties: 1",
         "- output.igw-test-region-InternetGatewayId | blocks: 0 | properties: 1",
         "- output.vpc-test-region-VpcArn | blocks: 0 | properties: 1",
         "- output.vpc-test-region-VpcId | blocks: 0 | properties: 1",
         "- resource.aws_internet_gateway.igw-test-region | blocks: 0 | properties: 2",
         "- resource.aws_vpc.vpc-test-region | blocks: 0 | properties: 5",
       ]
      `);
    });

    it('should handle regionId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateRegionId } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1B, AwsMultiAzRegionId.AWS_US_EAST_1C],
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateRegionId, {
          enableResourceCapture: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot update VPC immutable properties once it has been created!"`,
      );
    });

    it('should handle vpcCidrBlock change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateVpcCidrBlock } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsMultiAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/16',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateVpcCidrBlock, {
          enableResourceCapture: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot update VPC immutable properties once it has been created!"`,
      );
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region-1',
      type: AwsMultiAzRegionModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsMultiAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region-2',
      type: AwsMultiAzRegionModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate minimum regionIds', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsMultiAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A],
            vpcCidrBlock: '10.0.0.0/8',
          },
          moduleId: 'region',
          type: AwsMultiAzRegionModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"At least 2 regionIds are required!"`);
    });

    it('should validate duplicate region name', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsMultiAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
            vpcCidrBlock: '10.0.0.0/8',
          },
          moduleId: 'region1',
          type: AwsMultiAzRegionModule,
        });
        await testModuleContainer.runModule<AwsMultiAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
            vpcCidrBlock: '192.168.0.0/24',
          },
          moduleId: 'region2',
          type: AwsMultiAzRegionModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Region "test-region" already exists!"`);
    });

    it('should validate overlapping CIDR blocks', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsMultiAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region-1',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
            vpcCidrBlock: '10.0.0.0/8',
          },
          moduleId: 'region1',
          type: AwsMultiAzRegionModule,
        });
        await testModuleContainer.runModule<AwsMultiAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region-2',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
            vpcCidrBlock: '10.0.0.0/8',
          },
          moduleId: 'region2',
          type: AwsMultiAzRegionModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Overlapping VPC cidr blocks are not allowed!"`);
    });
  });
});
