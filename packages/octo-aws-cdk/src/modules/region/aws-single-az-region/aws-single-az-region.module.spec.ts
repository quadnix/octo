import { type Account, type App, DiffAssert, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { OctoTerraform } from '../../../factories/octo-terraform.factory.js';
import { HclAssert } from '../../../utilities/test-helpers/test-hcl-assert.js';
import { AwsSingleAzRegionId } from './index.schema.js';
import { AwsSingleAzRegionModule } from './index.js';

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

describe('AwsSingleAzRegionModule UT', () => {
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
    await testModuleContainer.runModule<AwsSingleAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsSingleAzRegionModule,
    });
    const result = await testModuleContainer.commit(app, {
      enableResourceCapture: true,
      filterByModuleIds: ['region'],
    });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsSingleAzRegionModelAction",
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
    await testModuleContainer.runModule<AwsSingleAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsSingleAzRegionModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/vpc=vpc-test-region",
       "+ @octo/internet-gateway=igw-test-region",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDelete } = await setup(testModuleContainer);
    const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
    expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "- @octo/vpc=vpc-test-region",
       "- @octo/internet-gateway=igw-test-region",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSingleAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsSingleAzRegionModule,
    });
    const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "+ @octo/vpc=vpc-test-region",
       "+ @octo/internet-gateway=igw-test-region",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSingleAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsSingleAzRegionModule,
    });
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/vpc=vpc-test-region",
       "* @octo/internet-gateway=igw-test-region",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();

    const { app: appDeleteTags } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSingleAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region',
      type: AwsSingleAzRegionModule,
    });
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
    expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot(`
     [
       "* @octo/vpc=vpc-test-region",
       "* @octo/internet-gateway=igw-test-region",
     ]
    `);
    expect(hcl.digest()).toMatchSnapshot();
  });

  describe('input changes', () => {
    it('should handle name change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsSingleAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsSingleAzRegionModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsSingleAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'changed-region',
          regionId: AwsSingleAzRegionId.AWS_US_EAST_1B,
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsSingleAzRegionModule,
      });
      const resultUpdateName = await testModuleContainer.commit(appUpdateName, { enableResourceCapture: true });
      expect(new DiffAssert(resultUpdateName.resourceDiffs).digest()).toMatchInlineSnapshot(`
       [
         "- @octo/vpc=vpc-test-region",
         "- @octo/internet-gateway=igw-test-region",
         "+ @octo/vpc=vpc-changed-region",
         "+ @octo/internet-gateway=igw-changed-region",
       ]
      `);
      expect(hcl.digest()).toMatchSnapshot();
    });

    it('should handle regionId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsSingleAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsSingleAzRegionModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateRegionId } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsSingleAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionId: AwsSingleAzRegionId.AWS_US_EAST_1B,
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsSingleAzRegionModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateRegionId, { enableResourceCapture: true });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot update VPC immutable properties once it has been created!"`,
      );
    });

    it('should handle vpcCidrBlock change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsSingleAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
          vpcCidrBlock: '10.0.0.0/8',
        },
        moduleId: 'region',
        type: AwsSingleAzRegionModule,
      });
      await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
      hcl.digest();

      const { app: appUpdateVpcCidrBlock } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsSingleAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
          vpcCidrBlock: '10.0.0.0/16',
        },
        moduleId: 'region',
        type: AwsSingleAzRegionModule,
      });
      await expect(async () => {
        await testModuleContainer.commit(appUpdateVpcCidrBlock, { enableResourceCapture: true });
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Cannot update VPC immutable properties once it has been created!"`,
      );
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSingleAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region-1',
      type: AwsSingleAzRegionModule,
    });
    await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
    hcl.digest();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSingleAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/8',
      },
      moduleId: 'region-2',
      type: AwsSingleAzRegionModule,
    });
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId, { enableResourceCapture: true });
    expect(new DiffAssert(resultUpdateModuleId.resourceDiffs).digest()).toMatchInlineSnapshot(`[]`);
    expect(hcl.digest()).toMatchSnapshot();
  });

  describe('validation', () => {
    it('should validate duplicate region name', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsSingleAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region',
            regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
            vpcCidrBlock: '10.0.0.0/8',
          },
          moduleId: 'region1',
          type: AwsSingleAzRegionModule,
        });
        await testModuleContainer.runModule<AwsSingleAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region',
            regionId: AwsSingleAzRegionId.AWS_US_EAST_1B,
            vpcCidrBlock: '192.168.0.0/24',
          },
          moduleId: 'region2',
          type: AwsSingleAzRegionModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Region "test-region" already exists!"`);
    });

    it('should validate overlapping CIDR blocks', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
        await testModuleContainer.runModule<AwsSingleAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region-1',
            regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
            vpcCidrBlock: '10.0.0.0/8',
          },
          moduleId: 'region1',
          type: AwsSingleAzRegionModule,
        });
        await testModuleContainer.runModule<AwsSingleAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region-2',
            regionId: AwsSingleAzRegionId.AWS_US_EAST_1B,
            vpcCidrBlock: '10.0.0.0/8',
          },
          moduleId: 'region2',
          type: AwsSingleAzRegionModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Overlapping VPC cidr blocks are not allowed!"`);
    });
  });
});
