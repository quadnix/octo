import { type Account, type App, TestContainer, TestModuleContainer, stub } from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
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
    const runModulesGenerator = testModuleContainer.runModules<AwsMultiAzRegionModule>(
      app,
      {
        inputs: {
          account: stub('${{testModule.model.account}}'),
          name: 'test-region',
          regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
          vpcCidrBlock: '10.0.0.0/16',
        },
        moduleId: 'region',
        type: AwsMultiAzRegionModule,
      },
      { filterByModuleIds: ['region'], skipTerraformApply: true },
    );

    const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
    expect(hclRender).toMatchInlineSnapshot(`
     "# region/main.tf
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
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "AddAwsMultiAzRegionModelAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "+ @octo/vpc=vpc-test-region",
       "+ @octo/internet-gateway=igw-test-region",
     ]
    `);
  });

  it('should CUD', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsMultiAzRegionModule>(
        appCreate,
        {
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
            vpcCidrBlock: '10.0.0.0/16',
          },
          moduleId: 'region',
          type: AwsMultiAzRegionModule,
        },
        { skipTerraformApply: true },
      )
      .next();

    const { app: appDelete } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsMultiAzRegionModule>(
          appDelete,
          {
            hidden: true,
            inputs: {
              account: stub('${{testModule.model.account}}'),
              name: 'test-region',
              regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
              vpcCidrBlock: '10.0.0.0/16',
            },
            moduleId: 'region',
            type: AwsMultiAzRegionModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
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
    await testModuleContainer
      .runModules<AwsMultiAzRegionModule>(
        appCreate,
        {
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
            vpcCidrBlock: '10.0.0.0/16',
          },
          moduleId: 'region',
          type: AwsMultiAzRegionModule,
        },
        { skipTerraformApply: true },
      )
      .next();

    testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
    const { app: appUpdateTags } = await setup(testModuleContainer);
    const updateTags = (
      await testModuleContainer
        .runModules<AwsMultiAzRegionModule>(
          appUpdateTags,
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              name: 'test-region',
              regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
              vpcCidrBlock: '10.0.0.0/16',
            },
            moduleId: 'region',
            type: AwsMultiAzRegionModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(updateTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/vpc=vpc-test-region",
       "* @octo/internet-gateway=igw-test-region",
     ]
    `);

    const { app: appDeleteTags } = await setup(testModuleContainer);
    const deleteTags = (
      await testModuleContainer
        .runModules<AwsMultiAzRegionModule>(
          appDeleteTags,
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              name: 'test-region',
              regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
              vpcCidrBlock: '10.0.0.0/16',
            },
            moduleId: 'region',
            type: AwsMultiAzRegionModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(deleteTags.hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/vpc=vpc-test-region",
       "* @octo/internet-gateway=igw-test-region",
     ]
    `);
  });

  describe('input changes', () => {
    it('should handle name change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsMultiAzRegionModule>(
          appCreate,
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              name: 'test-region',
              regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
              vpcCidrBlock: '10.0.0.0/16',
            },
            moduleId: 'region',
            type: AwsMultiAzRegionModule,
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appUpdateName } = await setup(testModuleContainer);
      const { hclDiff, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsMultiAzRegionModule>(
            appUpdateName,
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                name: 'changed-region',
                regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
                vpcCidrBlock: '10.0.0.0/16',
              },
              moduleId: 'region',
              type: AwsMultiAzRegionModule,
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(hclDiff).toMatchSnapshot();
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
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
      await testModuleContainer
        .runModules<AwsMultiAzRegionModule>(
          appCreate,
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              name: 'test-region',
              regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
              vpcCidrBlock: '10.0.0.0/16',
            },
            moduleId: 'region',
            type: AwsMultiAzRegionModule,
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appUpdateRegionId } = await setup(testModuleContainer);
      // regionIds change only the availability zones (region stays us-east-1), which is VPC metadata
      // not rendered into the aws_vpc block → no VPC diff; the change ripples a parent-update to igw.
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsMultiAzRegionModule>(
            appUpdateRegionId,
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                name: 'test-region',
                regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1B, AwsMultiAzRegionId.AWS_US_EAST_1C],
                vpcCidrBlock: '10.0.0.0/16',
              },
              moduleId: 'region',
              type: AwsMultiAzRegionModule,
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/internet-gateway=igw-test-region",
       ]
      `);
    });

    it('should handle vpcCidrBlock change', async () => {
      const { app: appCreate } = await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsMultiAzRegionModule>(
          appCreate,
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              name: 'test-region',
              regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
              vpcCidrBlock: '10.0.0.0/16',
            },
            moduleId: 'region',
            type: AwsMultiAzRegionModule,
          },
          { skipTerraformApply: true },
        )
        .next();

      const { app: appUpdateVpcCidrBlock } = await setup(testModuleContainer);
      // cidr_block is force-new on aws_vpc → octo emits a REPLACE on the vpc.
      const { resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsMultiAzRegionModule>(
            appUpdateVpcCidrBlock,
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                name: 'test-region',
                regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
                vpcCidrBlock: '10.0.0.0/24',
              },
              moduleId: 'region',
              type: AwsMultiAzRegionModule,
            },
            { skipTerraformApply: true },
          )
          .next()
      ).value!;
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "^ @octo/vpc=vpc-test-region",
         "* @octo/internet-gateway=igw-test-region",
       ]
      `);
    });
  });

  it('should handle moduleId change', async () => {
    const { app: appCreate } = await setup(testModuleContainer);
    await testModuleContainer
      .runModules<AwsMultiAzRegionModule>(
        appCreate,
        {
          inputs: {
            account: stub('${{testModule.model.account}}'),
            name: 'test-region',
            regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
            vpcCidrBlock: '10.0.0.0/16',
          },
          moduleId: 'region-1',
          type: AwsMultiAzRegionModule,
        },
        { skipTerraformApply: true },
      )
      .next();

    const { app: appUpdateModuleId } = await setup(testModuleContainer);
    const { hclDiff, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsMultiAzRegionModule>(
          appUpdateModuleId,
          {
            inputs: {
              account: stub('${{testModule.model.account}}'),
              name: 'test-region',
              regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
              vpcCidrBlock: '10.0.0.0/16',
            },
            moduleId: 'region-2',
            type: AwsMultiAzRegionModule,
          },
          { skipTerraformApply: true },
        )
        .next()
    ).value!;
    expect(hclDiff).toMatchSnapshot();
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`[]`);
  });

  describe('validation', () => {
    it('should validate minimum regionIds', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsMultiAzRegionModule>(
            app,
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                name: 'test-region',
                regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A],
                vpcCidrBlock: '10.0.0.0/16',
              },
              moduleId: 'region',
              type: AwsMultiAzRegionModule,
            },
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"At least 2 regionIds are required!"`);
    });

    it('should validate duplicate region name', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsMultiAzRegionModule>(
            app,
            [
              {
                inputs: {
                  account: stub('${{testModule.model.account}}'),
                  name: 'test-region',
                  regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
                  vpcCidrBlock: '10.0.0.0/16',
                },
                moduleId: 'region1',
                type: AwsMultiAzRegionModule,
              },
              {
                inputs: {
                  account: stub('${{testModule.model.account}}'),
                  name: 'test-region',
                  regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
                  vpcCidrBlock: '192.168.0.0/24',
                },
                moduleId: 'region2',
                type: AwsMultiAzRegionModule,
              },
            ],
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Region "test-region" already exists!"`);
    });

    it('should validate overlapping CIDR blocks', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsMultiAzRegionModule>(
            app,
            [
              {
                inputs: {
                  account: stub('${{testModule.model.account}}'),
                  name: 'test-region-1',
                  regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
                  vpcCidrBlock: '10.0.0.0/16',
                },
                moduleId: 'region1',
                type: AwsMultiAzRegionModule,
              },
              {
                inputs: {
                  account: stub('${{testModule.model.account}}'),
                  name: 'test-region-2',
                  regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
                  vpcCidrBlock: '10.0.0.0/16',
                },
                moduleId: 'region2',
                type: AwsMultiAzRegionModule,
              },
            ],
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"Overlapping VPC cidr blocks are not allowed!"`);
    });

    it('should validate invalid VPC cidr block', async () => {
      const { app } = await setup(testModuleContainer);
      await expect(
        testModuleContainer
          .runModules<AwsMultiAzRegionModule>(
            app,
            {
              inputs: {
                account: stub('${{testModule.model.account}}'),
                name: 'test-region',
                regionIds: [AwsMultiAzRegionId.AWS_US_EAST_1A, AwsMultiAzRegionId.AWS_US_EAST_1B],
                vpcCidrBlock: '10.0.0.0/8',
              },
              moduleId: 'region',
              type: AwsMultiAzRegionModule,
            },
            { skipTerraformApply: true },
          )
          .next(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"Invalid VPC cidr block "10.0.0.0/8"! AWS requires a valid IpV4 cidr between /16 and /28."`,
      );
    });
  });
});
