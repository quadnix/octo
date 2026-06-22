import { type Account, type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
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
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
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
        vpcCidrBlock: '10.0.0.0/16',
      },
      moduleId: 'region',
      type: AwsSingleAzRegionModule,
    });

    expect(await testModuleContainer.renderHcl(app)).toMatchInlineSnapshot(`
     "# region/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
     }

     resource "aws_vpc" "vpc-test-region" {
       provider = aws._123-us-east-1
       cidr_block = "10.0.0.0/16"
       enable_dns_hostnames = true
       enable_dns_support = true
       instance_tenancy = "default"
     }

     resource "aws_internet_gateway" "igw-test-region" {
       provider = aws._123-us-east-1
       vpc_id = aws_vpc.vpc-test-region.id
     }

     # region/outputs.tf
     output "vpc-test-region-VpcArn" {
       value = aws_vpc.vpc-test-region.arn
     }

     output "vpc-test-region-VpcId" {
       value = aws_vpc.vpc-test-region.id
     }

     output "igw-test-region-InternetGatewayArn" {
       value = aws_internet_gateway.igw-test-region.arn
     }

     output "igw-test-region-InternetGatewayId" {
       value = aws_internet_gateway.igw-test-region.id
     }

     # region/terragrunt.hcl
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

     # region/variables.tf
     <empty>"
    `);

    const result = await testModuleContainer.commit(app, { filterByModuleIds: ['region'] });
    expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsSingleAzRegionModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(result.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/vpc=vpc-test-region",
       "+ @octo/internet-gateway=igw-test-region",
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
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
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/vpc=vpc-test-region",
       "+ @octo/internet-gateway=igw-test-region",
     ]
    `);

    const { app: appDelete } = await setup(testModuleContainer);
    expect(await testModuleContainer.diffHcl(appDelete)).toMatchSnapshot();
    const resultDelete = await testModuleContainer.commit(appDelete);
    expect(testModuleContainer.digestDiffs(resultDelete.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "- @octo/vpc=vpc-test-region",
       "- @octo/internet-gateway=igw-test-region",
     ]
    `);

    const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
    expect(isResourceStateEqual).toBe(true);
  });

  it('should CUD tags', async () => {
    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
    const { app: appCreate } = await setup(testModuleContainer);
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
    const resultCreate = await testModuleContainer.commit(appCreate);
    expect(testModuleContainer.digestDiffs(resultCreate.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/vpc=vpc-test-region",
       "+ @octo/internet-gateway=igw-test-region",
     ]
    `);

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
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
    expect(await testModuleContainer.diffHcl(appUpdateTags)).toMatchSnapshot();
    const resultUpdateTags = await testModuleContainer.commit(appUpdateTags);
    expect(testModuleContainer.digestDiffs(resultUpdateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/vpc=vpc-test-region",
       "* @octo/internet-gateway=igw-test-region",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
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
    expect(await testModuleContainer.diffHcl(appDeleteTags)).toMatchSnapshot();
    const resultDeleteTags = await testModuleContainer.commit(appDeleteTags);
    expect(testModuleContainer.digestDiffs(resultDeleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/vpc=vpc-test-region",
       "* @octo/internet-gateway=igw-test-region",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle name change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
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
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateName } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsSingleAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'changed-region',
          regionId: AwsSingleAzRegionId.AWS_US_EAST_1B,
          vpcCidrBlock: '10.0.0.0/16',
        },
        moduleId: 'region',
        type: AwsSingleAzRegionModule,
      });
      expect(await testModuleContainer.diffHcl(appUpdateName)).toMatchSnapshot();
      const resultUpdateName = await testModuleContainer.commit(appUpdateName);
      expect(testModuleContainer.digestDiffs(resultUpdateName.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "- @octo/vpc=vpc-test-region",
         "- @octo/internet-gateway=igw-test-region",
         "+ @octo/vpc=vpc-changed-region",
         "+ @octo/internet-gateway=igw-changed-region",
       ]
      `);
    });

    it('should handle regionId change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
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
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateRegionId } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsSingleAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionId: AwsSingleAzRegionId.AWS_US_EAST_1B,
          vpcCidrBlock: '10.0.0.0/16',
        },
        moduleId: 'region',
        type: AwsSingleAzRegionModule,
      });
      // regionId change moves the provider region (and AZ) of every resource → terraform recreates
      // them. Octo emits a REPLACE on the force-new resources.
      const resultUpdateRegionId = await testModuleContainer.commit(appUpdateRegionId);
      expect(testModuleContainer.digestDiffs(resultUpdateRegionId.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/internet-gateway=igw-test-region",
       ]
      `);
    });

    it('should handle vpcCidrBlock change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
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
      await testModuleContainer.commit(appCreate);

      const { app: appUpdateVpcCidrBlock } = await setup(testModuleContainer);
      await testModuleContainer.runModule<AwsSingleAzRegionModule>({
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
          vpcCidrBlock: '10.0.0.0/24',
        },
        moduleId: 'region',
        type: AwsSingleAzRegionModule,
      });
      // cidr_block is force-new on aws_vpc → octo emits a REPLACE on the vpc (and force-new dependents).
      const resultUpdateVpcCidrBlock = await testModuleContainer.commit(appUpdateVpcCidrBlock);
      expect(testModuleContainer.digestDiffs(resultUpdateVpcCidrBlock.resourceDiffs)).toMatchInlineSnapshot(`
       [
         "^ @octo/vpc=vpc-test-region",
         "* @octo/internet-gateway=igw-test-region",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSingleAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/16',
      },
      moduleId: 'region-1',
      type: AwsSingleAzRegionModule,
    });
    await testModuleContainer.commit(appCreate);

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    await testModuleContainer.runModule<AwsSingleAzRegionModule>({
      inputs: {
        account: stub('${{testModule.model.account}}'),
        name: 'test-region',
        regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
        vpcCidrBlock: '10.0.0.0/16',
      },
      moduleId: 'region-2',
      type: AwsSingleAzRegionModule,
    });
    expect(await testModuleContainer.diffHcl(appUpdateModuleId)).toMatchSnapshot();
    const resultUpdateModuleId = await testModuleContainer.commit(appUpdateModuleId);
    expect(testModuleContainer.digestDiffs(resultUpdateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
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
            vpcCidrBlock: '10.0.0.0/16',
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
            vpcCidrBlock: '10.0.0.0/16',
          },
          moduleId: 'region1',
          type: AwsSingleAzRegionModule,
        });
        await testModuleContainer.runModule<AwsSingleAzRegionModule>({
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region-2',
            regionId: AwsSingleAzRegionId.AWS_US_EAST_1B,
            vpcCidrBlock: '10.0.0.0/16',
          },
          moduleId: 'region2',
          type: AwsSingleAzRegionModule,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Overlapping VPC cidr blocks are not allowed!"`);
    });

    it('should validate invalid VPC cidr block', async () => {
      await setup(testModuleContainer);
      await expect(async () => {
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
      }).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid VPC cidr block "10.0.0.0/8"! AWS requires a valid IpV4 cidr between /16 and /28."`,
      );
    });
  });
});
