import { readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { TestContainer, TestModuleContainer } from '@quadnix/octo';
import { OctoTerraform } from './octo-terraform.factory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('OctoTerraform UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize();
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  describe('render()', () => {
    let terraform: OctoTerraform;
    let octoTerraformResource: ReturnType<OctoTerraform['addOctoTerraformResource']>;
    let terraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;

    beforeEach(async () => {
      const { '@octo/vpc=vpc-region': vpcResource } = await testModuleContainer.createTestResources(
        'test-module',
        [
          {
            properties: {
              awsAccountId: '123',
              awsAvailabilityZones: ['us-east-1a'],
              awsRegionId: 'us-east-1',
              CidrBlock: '10.0.0.0/24',
              InstanceTenancy: 'default',
            },
            resourceContext: '@octo/vpc=vpc-region',
            response: {},
          },
        ],
        { save: false },
      );

      terraform = new OctoTerraform();
      terraform.addTerraformConfig();
      terraform.addTerraformProvider('123', 'us-east-1');
      octoTerraformResource = terraform.addOctoTerraformResource(vpcResource);
      terraformResource = octoTerraformResource.addTerraformResource('aws_vpc', 'vpc-region');
    });

    it('should render without any terraform resources', () => {
      const terraform = new OctoTerraform();
      expect(terraform.render()).toMatchInlineSnapshot(`
       "terraform {

       }"
      `);
    });

    describe('TerraformValue', () => {
      it('should render array', () => {
        terraformResource.attribute('array_key', [true, 1, 'string_value']);
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
           array_key = [true, 1, "string_value"]
         }"
        `);
      });

      it('should render boolean', () => {
        terraformResource.attribute('boolean_key', true);
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
           boolean_key = true
         }"
        `);
      });

      it('should render number', () => {
        terraformResource.attribute('number_key', 1);
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
           number_key = 1
         }"
        `);
      });

      it('should render object', () => {
        terraformResource.attribute('object_key', terraform.jsonencode({ key1: true, key2: 1, key3: 'string_value' }));
        terraformResource.attribute(
          'nested_object_key',
          terraform.jsonencode({
            arrayKey: [true, 1, 'string_value'],
            nestedKey: { key1: true, key2: 1, key3: 'string_value' },
          }),
        );
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
           object_key = jsonencode({
             key1 = true
             key2 = 1
             key3 = "string_value"
           })
           nested_object_key = jsonencode({
             arrayKey = [true, 1, "string_value"]
             nestedKey = {
               key1 = true
               key2 = 1
               key3 = "string_value"
             }
           })
         }"
        `);
      });

      it('should render string', () => {
        terraformResource.attribute('string_key', 'string_value');
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
           string_key = "string_value"
         }"
        `);
      });

      it('should render map attr', () => {
        terraformResource.attribute('tags', terraform.mapAttr({ Env: 'prod', Name: 'my-vpc' }));
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
           tags = {
             Env = "prod"
             Name = "my-vpc"
           }
         }"
        `);
      });
    });

    describe('TerraformAttribute', () => {
      it('should render with correct indent', () => {
        terraformResource.attribute('string_key', 'string_value');
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
           string_key = "string_value"
         }"
        `);
      });
    });

    describe('TerraformBlock', () => {
      it('should render with correct indent', () => {
        const terraformResourceBlock = terraformResource.block('block_key');
        terraformResourceBlock.attribute('string_key', 'string_value');
        terraformResourceBlock.attribute(
          'nested_object_key',
          terraform.jsonencode({
            arrayKey: [true, 1, 'string_value'],
            nestedKey: { key1: true, key2: 1, key3: 'string_value' },
          }),
        );
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
           block_key {
             string_key = "string_value"
             nested_object_key = jsonencode({
               arrayKey = [true, 1, "string_value"]
               nestedKey = {
                 key1 = true
                 key2 = 1
                 key3 = "string_value"
               }
             })
           }
         }"
        `);
        expect(terraformResourceBlock.render('', '  ')).toMatchInlineSnapshot(`
         "block_key {
           string_key = "string_value"
           nested_object_key = jsonencode({
             arrayKey = [true, 1, "string_value"]
             nestedKey = {
               key1 = true
               key2 = 1
               key3 = "string_value"
             }
           })
         }"
        `);
      });
    });

    describe('TerraformOutput', () => {
      it('should render with correct indent', () => {
        octoTerraformResource.output({
          output_raw_key: terraform.raw('aws_vpc.vpc-region.id'),
          output_string_key: 'string_value',
        });
        expect(octoTerraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
         }

         output "vpc-region-output_raw_key" {
           value = aws_vpc.vpc-region.id
         }

         output "vpc-region-output_string_key" {
           value = "string_value"
         }"
        `);
      });
    });

    describe('TerraformResource', () => {
      it('should render with correct indent', () => {
        terraformResource.attribute('string_key', 'string_value');
        terraformResource.block('block_key').attribute('string_key', 'string_value');
        octoTerraformResource.output({ output_string_key: 'string_value' });
        expect(octoTerraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
           string_key = "string_value"
           block_key {
             string_key = "string_value"
           }
         }

         output "vpc-region-output_string_key" {
           value = "string_value"
         }"
        `);
      });
    });

    describe('TerraformVariable', () => {
      it('should render with correct indent', () => {
        const varStringKey = terraform.variable('var_string_key', 'string', {
          default: 'string_value',
          sensitive: true,
        });
        terraform.variable('var_array_key', terraform.type(['bool']), {
          default: [true, false, true],
          sensitive: false,
        });
        terraform.variable(
          'var_nested_object_key',
          terraform.type({
            arrayKey: terraform.type(['bool']),
            nestedKey: terraform.type({
              key1: 'bool',
              key2: 'number',
              key3: 'string',
            }),
          }),
          {
            default: {
              arrayKey: [true, false],
              nestedKey: { key1: true, key2: 1, key3: 'string_value' },
            },
            sensitive: false,
          },
        );

        terraformResource.attribute('string_key', varStringKey.ref);
        octoTerraformResource.output({ output_string_key: varStringKey.ref });

        expect(terraform.render()).toMatchInlineSnapshot(`
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

         variable "var_string_key" {
           type = string
           default = "string_value"
           sensitive = true
         }

         variable "var_array_key" {
           type = list(bool)
           default = [true, false, true]
         }

         variable "var_nested_object_key" {
           type = object({
             arrayKey = list(bool)
             nestedKey = object({
               key1 = bool
               key2 = number
               key3 = string
             })
           })
           default = {
           arrayKey = [true, false]
           nestedKey = {
             key1 = true
             key2 = 1
             key3 = "string_value"
           }
         }
         }

         resource "aws_vpc" "vpc-region" {
           provider = aws.123-us-east-1
           string_key = var.var_string_key
         }

         output "vpc-region-output_string_key" {
           value = var.var_string_key
         }"
        `);
      });
    });
  });

  describe('render() multiple', () => {
    let terraform: OctoTerraform;
    let vpcResource: Parameters<OctoTerraform['addOctoTerraformResource']>[0];
    let igwOctoResource: ReturnType<OctoTerraform['addOctoTerraformResource']>;
    let vpcOctoResource: ReturnType<OctoTerraform['addOctoTerraformResource']>;
    let igwTerraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;
    let vpcTerraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;

    beforeEach(async () => {
      const { '@octo/internet-gateway=igw-region': igwResource, '@octo/vpc=vpc-region': _vpcResource } =
        await testModuleContainer.createTestResources(
          'test-module',
          [
            {
              properties: {
                awsAccountId: '123',
                awsRegionId: 'us-east-1',
                internetGatewayName: 'default',
              },
              resourceContext: '@octo/internet-gateway=igw-region',
              response: {},
            },
            {
              properties: {
                awsAccountId: '123',
                awsAvailabilityZones: ['us-east-1a'],
                awsRegionId: 'us-east-1',
                CidrBlock: '10.0.0.0/24',
                InstanceTenancy: 'default',
              },
              resourceContext: '@octo/vpc=vpc-region',
              response: {},
            },
          ],
          { save: false },
        );

      vpcResource = _vpcResource;
      terraform = new OctoTerraform();
      igwOctoResource = terraform.addOctoTerraformResource(igwResource);
      igwTerraformResource = igwOctoResource.addTerraformResource('aws_igw', 'igw-region');
      vpcOctoResource = terraform.addOctoTerraformResource(vpcResource);
      vpcTerraformResource = vpcOctoResource.addTerraformResource('aws_vpc', 'vpc-region');
    });

    it('should render with correct indent', () => {
      vpcOctoResource.output({ vpc_id: terraform.raw(vpcTerraformResource.address + '.id') });

      igwTerraformResource.attribute('string_key', terraform.getRef(vpcResource, 'vpc_id'));
      igwTerraformResource.block('block_key').attribute('string_key', 'string_value');
      igwOctoResource.output({ igw_output_string_key: 'string_value' });

      vpcTerraformResource.attribute('string_key', 'string_value');
      vpcTerraformResource.block('block_key').attribute('string_key', 'string_value');

      expect(terraform.render()).toMatchInlineSnapshot(`
       "terraform {

       }

       resource "aws_igw" "igw-region" {
         string_key = aws_vpc.vpc-region.id
         block_key {
           string_key = "string_value"
         }
       }

       output "igw-region-igw_output_string_key" {
         value = "string_value"
       }

       resource "aws_vpc" "vpc-region" {
         string_key = "string_value"
         block_key {
           string_key = "string_value"
         }
       }

       output "vpc-region-vpc_id" {
         value = aws_vpc.vpc-region.id
       }"
      `);
    });
  });

  describe('write()', () => {
    let terraform: OctoTerraform;
    let vpcResource: Parameters<OctoTerraform['addOctoTerraformResource']>[0];
    let igwOctoResource: ReturnType<OctoTerraform['addOctoTerraformResource']>;
    let vpcOctoResource: ReturnType<OctoTerraform['addOctoTerraformResource']>;
    let igwTerraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;
    let vpcTerraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;

    beforeEach(async () => {
      const { '@octo/internet-gateway=igw-region': igwResource, '@octo/vpc=vpc-region': _vpcResource } =
        await testModuleContainer.createTestResources(
          'test-module',
          [
            {
              properties: {
                awsAccountId: '123',
                awsRegionId: 'us-east-1',
                internetGatewayName: 'default',
              },
              resourceContext: '@octo/internet-gateway=igw-region',
              response: {},
            },
            {
              properties: {
                awsAccountId: '123',
                awsAvailabilityZones: ['us-east-1a'],
                awsRegionId: 'us-east-1',
                CidrBlock: '10.0.0.0/24',
                InstanceTenancy: 'default',
              },
              resourceContext: '@octo/vpc=vpc-region',
              response: {},
            },
          ],
          { save: false },
        );

      vpcResource = _vpcResource;
      terraform = new OctoTerraform(join(__dirname, 'octo-terraform.tf'), 2);
      terraform.addTerraformConfig();
      terraform.addTerraformProvider('123', 'us-east-1');
      igwOctoResource = terraform.addOctoTerraformResource(igwResource);
      igwTerraformResource = igwOctoResource.addTerraformResource('aws_igw', 'igw-region');
      vpcOctoResource = terraform.addOctoTerraformResource(vpcResource);
      vpcTerraformResource = vpcOctoResource.addTerraformResource('aws_vpc', 'vpc-region');
    });

    afterEach(async () => {
      await rm(join(__dirname, 'octo-terraform.tf'), { force: true });
    });

    it('should write with correct indent', async () => {
      vpcOctoResource.output({ vpc_id: terraform.raw(vpcTerraformResource.address + '.id') });

      igwTerraformResource.attribute('string_key', terraform.getRef(vpcResource, 'vpc_id'));
      igwTerraformResource.block('block_key').attribute('string_key', 'string_value');
      igwOctoResource.output({ igw_output_string_key: 'string_value' });

      vpcTerraformResource.attribute('string_key', 'string_value');
      vpcTerraformResource.block('block_key').attribute('string_key', 'string_value');

      await terraform.write();

      const terraformFileContents = await readFile(join(__dirname, 'octo-terraform.tf'), { encoding: 'utf-8' });
      expect(terraformFileContents).toMatchInlineSnapshot(`
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

       resource "aws_igw" "igw-region" {
         provider = aws.123-us-east-1
         string_key = aws_vpc.vpc-region.id
         block_key {
           string_key = "string_value"
         }
       }

       output "igw-region-igw_output_string_key" {
         value = "string_value"
       }

       resource "aws_vpc" "vpc-region" {
         provider = aws.123-us-east-1
         string_key = "string_value"
         block_key {
           string_key = "string_value"
         }
       }

       output "vpc-region-vpc_id" {
         value = aws_vpc.vpc-region.id
       }"
      `);
    });
  });
});
