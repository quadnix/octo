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
      terraformResource = terraform.addOctoTerraformResource(vpcResource).addTerraformResource('aws_vpc', 'vpc-region');
    });

    it('should render without any terraform resources', () => {
      const terraform = new OctoTerraform();
      expect(terraform.render()).toMatchInlineSnapshot(`""`);
    });

    describe('TerraformValue', () => {
      it('should render array', () => {
        terraformResource.attribute('array_key', [true, 1, 'string_value']);
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           array_key = [true, 1, "string_value"]
         }"
        `);
      });

      it('should render boolean', () => {
        terraformResource.attribute('boolean_key', true);
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           boolean_key = true
         }"
        `);
      });

      it('should render number', () => {
        terraformResource.attribute('number_key', 1);
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
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
           string_key = "string_value"
         }"
        `);
      });
    });

    describe('TerraformAttribute', () => {
      it('should render with correct indent', () => {
        terraformResource.attribute('string_key', 'string_value');
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
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
        terraformResource.output('output_string_key', 'string_value');
        terraformResource.output('output_array_key', [true, 1, 'string_value']);
        terraformResource.output(
          'output_nested_object_key',
          terraform.jsonencode({
            arrayKey: [true, 1, 'string_value'],
            nestedKey: { key1: true, key2: 1, key3: 'string_value' },
          }),
        );
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {

         }

         output "output_string_key" {
           value = "string_value"
         }

         output "output_array_key" {
           value = [true, 1, "string_value"]
         }

         output "output_nested_object_key" {
           value = jsonencode({
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

    describe('TerraformResource', () => {
      it('should render with correct indent', () => {
        terraformResource.attribute('string_key', 'string_value');
        terraformResource.block('block_key').attribute('string_key', 'string_value');
        terraformResource.output('output_string_key', 'string_value');
        expect(terraformResource.render('  ')).toMatchInlineSnapshot(`
         "resource "aws_vpc" "vpc-region" {
           string_key = "string_value"
           block_key {
             string_key = "string_value"
           }
         }

         output "output_string_key" {
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
        terraform.variable('var_array_key', terraform.type(['bool', 'number', 'string']), {
          default: [true, 1, 'string_value'],
          sensitive: false,
        });
        terraform.variable(
          'var_nested_object_key',
          terraform.type({
            arrayKey: terraform.type(['bool', 'number', 'string']),
            nestedKey: terraform.type({
              key1: 'bool',
              key2: 'number',
              key3: 'string',
            }),
          }),
          {
            default: terraform.jsonencode({
              arrayKey: [true, 1, 'string_value'],
              nestedKey: { key1: true, key2: 1, key3: 'string_value' },
            }),
            sensitive: false,
          },
        );

        terraformResource.attribute('string_key', varStringKey.ref);
        terraformResource.output('output_string_key', varStringKey.ref);

        expect(terraform.render()).toMatchInlineSnapshot(`
         "variable "var_string_key" {
           type = string
           default = "string_value"
           sensitive = true
         }

         variable "var_array_key" {
           type = list(bool)
           default = [true, 1, "string_value"]
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
           default = jsonencode({
             arrayKey = [true, 1, "string_value"]
             nestedKey = {
               key1 = true
               key2 = 1
               key3 = "string_value"
             }
           })
         }

         resource "aws_vpc" "vpc-region" {
           string_key = var.var_string_key
         }

         output "output_string_key" {
           value = var.var_string_key
         }"
        `);
      });
    });
  });

  describe('render() multiple', () => {
    let terraform: OctoTerraform;
    let igwTerraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;
    let vpcTerraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;

    beforeEach(async () => {
      const { '@octo/internet-gateway=igw-region': igwResource, '@octo/vpc=vpc-region': vpcResource } =
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

      terraform = new OctoTerraform();
      igwTerraformResource = terraform
        .addOctoTerraformResource(igwResource)
        .addTerraformResource('aws_igw', 'igw-region');
      vpcTerraformResource = terraform
        .addOctoTerraformResource(vpcResource)
        .addTerraformResource('aws_vpc', 'vpc-region');
    });

    it('should render with correct indent', () => {
      igwTerraformResource.attribute('string_key', terraform.raw(vpcTerraformResource.address + '.id'));
      igwTerraformResource.block('block_key').attribute('string_key', 'string_value');
      igwTerraformResource.output('igw_output_string_key', 'string_value');

      vpcTerraformResource.attribute('string_key', 'string_value');
      vpcTerraformResource.block('block_key').attribute('string_key', 'string_value');
      vpcTerraformResource.output('vpc_output_string_key', 'string_value');

      expect(terraform.render()).toMatchInlineSnapshot(`
       "resource "aws_igw" "igw-region" {
         string_key = aws_vpc.vpc-region.id
         block_key {
           string_key = "string_value"
         }
       }

       output "igw_output_string_key" {
         value = "string_value"
       }

       resource "aws_vpc" "vpc-region" {
         string_key = "string_value"
         block_key {
           string_key = "string_value"
         }
       }

       output "vpc_output_string_key" {
         value = "string_value"
       }"
      `);
    });
  });

  describe('write()', () => {
    let terraform: OctoTerraform;
    let igwTerraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;
    let vpcTerraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;

    beforeEach(async () => {
      const { '@octo/internet-gateway=igw-region': igwResource, '@octo/vpc=vpc-region': vpcResource } =
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

      terraform = new OctoTerraform(
        join(__dirname, 'octo-terraform.tf'),
        join(__dirname, 'octo-terraform.manifest.json'),
        2,
        false,
      );
      igwTerraformResource = terraform
        .addOctoTerraformResource(igwResource)
        .addTerraformResource('aws_igw', 'igw-region');
      vpcTerraformResource = terraform
        .addOctoTerraformResource(vpcResource)
        .addTerraformResource('aws_vpc', 'vpc-region');
    });

    afterEach(async () => {
      await rm(join(__dirname, 'octo-terraform.tf'), { force: true });
      await rm(join(__dirname, 'octo-terraform.manifest.json'), { force: true });
    });

    it('should write with correct indent', async () => {
      igwTerraformResource.attribute('string_key', terraform.raw(vpcTerraformResource.address + '.id'));
      igwTerraformResource.block('block_key').attribute('string_key', 'string_value');
      igwTerraformResource.output('igw_output_string_key', 'string_value');

      vpcTerraformResource.attribute('string_key', 'string_value');
      vpcTerraformResource.block('block_key').attribute('string_key', 'string_value');
      vpcTerraformResource.output('vpc_output_string_key', 'string_value');

      await terraform.apply();

      const terraformFileContents = await readFile(join(__dirname, 'octo-terraform.tf'), { encoding: 'utf-8' });
      expect(terraformFileContents).toMatchInlineSnapshot(`
       "resource "aws_igw" "igw-region" {
         string_key = aws_vpc.vpc-region.id
         block_key {
           string_key = "string_value"
         }
       }

       output "igw_output_string_key" {
         value = "string_value"
       }

       resource "aws_vpc" "vpc-region" {
         string_key = "string_value"
         block_key {
           string_key = "string_value"
         }
       }

       output "vpc_output_string_key" {
         value = "string_value"
       }"
      `);
    });
  });

  describe('apply()', () => {
    describe('when octoTerraformApplyEnabled is false', () => {
      let terraform: OctoTerraform;
      let dummyTerraformResource: ReturnType<
        ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']
      >;

      beforeEach(async () => {
        const { '@octo/dummy=dummy': dummyResource } = await testModuleContainer.createTestResources(
          'test-module',
          [
            {
              properties: {
                awsAccountId: '123',
                awsRegionId: 'us-east-1',
              },
              resourceContext: '@octo/dummy=dummy',
              response: {},
            },
          ],
          { save: false },
        );

        terraform = new OctoTerraform(
          join(__dirname, 'octo-terraform.tf'),
          join(__dirname, 'octo-terraform.manifest.json'),
          2,
          false,
        );
        dummyTerraformResource = terraform
          .addOctoTerraformResource(dummyResource)
          .addTerraformResource('terraform_data', 'dummy');
      });

      afterEach(async () => {
        await rm(join(__dirname, 'octo-terraform.tf'), { force: true });
        await rm(join(__dirname, 'octo-terraform.manifest.json'), { force: true });
      });

      it('should return default outputs', async () => {
        dummyTerraformResource.attribute('input', '123');
        dummyTerraformResource.output('dummy_status', terraform.raw(dummyTerraformResource.address + '.id'));

        const terraformOutputs = await terraform.apply();

        expect(terraformOutputs).toMatchInlineSnapshot(`
         {
           "dummy_status": "terraform_data.dummy.id",
         }
        `);
      });
    });

    describe('when octoTerraformApplyEnabled is true', () => {
      let terraform: OctoTerraform;
      let dummyTerraformResource: ReturnType<
        ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']
      >;

      beforeEach(async () => {
        const { '@octo/dummy=dummy': dummyResource } = await testModuleContainer.createTestResources(
          'test-module',
          [
            {
              properties: {
                awsAccountId: '123',
                awsRegionId: 'us-east-1',
              },
              resourceContext: '@octo/dummy=dummy',
              response: {},
            },
          ],
          { save: false },
        );

        terraform = new OctoTerraform(
          join(__dirname, 'octo-terraform.tf'),
          join(__dirname, 'octo-terraform.manifest.json'),
          2,
          true,
        );
        dummyTerraformResource = terraform
          .addOctoTerraformResource(dummyResource)
          .addTerraformResource('terraform_data', 'dummy');
      });

      afterEach(async () => {
        await rm(join(__dirname, 'octo-terraform.tf'), { force: true });
        await rm(join(__dirname, 'octo-terraform.manifest.json'), { force: true });
        await rm(join(__dirname, 'terraform.tfstate'), { force: true });
      });

      it('should return actual outputs', async () => {
        const inputVar = terraform.variable('input_var', 'number', { default: 123, sensitive: false });

        dummyTerraformResource.attribute('input', inputVar.ref);
        dummyTerraformResource.output('dummy_input', terraform.raw(dummyTerraformResource.address + '.input'));
        dummyTerraformResource.output('dummy_status', terraform.raw(dummyTerraformResource.address + '.id'));

        const terraformOutputs = await terraform.apply();

        expect(Object.keys(terraformOutputs).length).toBe(2);
        expect(typeof terraformOutputs.dummy_input).toBe('number');
        expect(terraformOutputs.dummy_input).toBe(123);
        expect(typeof terraformOutputs.dummy_status).toBe('string');
        expect(terraformOutputs.dummy_status).not.toBe(dummyTerraformResource.address + '.id');
      });
    });
  });

  describe('serialization & deserialization', () => {
    let terraform: OctoTerraform;
    let igwTerraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;
    let vpcTerraformResource: ReturnType<ReturnType<OctoTerraform['addOctoTerraformResource']>['addTerraformResource']>;

    beforeEach(async () => {
      const { '@octo/internet-gateway=igw-region': igwResource, '@octo/vpc=vpc-region': vpcResource } =
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
                awsAvailabilityZones: ['us-east-1a', 'us-east-1b'],
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
      igwTerraformResource = terraform
        .addOctoTerraformResource(igwResource)
        .addTerraformResource('aws_igw', 'igw-region');
      vpcTerraformResource = terraform
        .addOctoTerraformResource(vpcResource)
        .addTerraformResource('aws_vpc', 'vpc-region');
    });

    it('should serialize and deserialize correctly', () => {
      const varEnvironment = terraform.variable(
        'environment',
        terraform.type({
          name: 'string',
          tags: terraform.type({}),
        }),
        {
          default: terraform.jsonencode({
            name: 'dev',
            tags: {
              cost_center: '1234',
              team: 'platform',
            },
          }),
          sensitive: false,
        },
      );
      const varSubnetCidrList = terraform.variable('subnet_cidr_list', terraform.type(['string']), {
        default: ['10.0.1.0/24', '10.0.2.0/24'],
        sensitive: false,
      });
      const varAdditionalTags = terraform.variable(
        'additional_tags',
        terraform.type({
          Attributes: terraform.type(['string']),
          Name: 'string',
          Service: 'string',
        }),
        {
          default: terraform.jsonencode({
            Attributes: ['blue', 'canary'],
            Name: 'octo',
            Service: 'core',
          }),
          sensitive: false,
        },
      );
      vpcTerraformResource.attribute('cidr_block', '10.0.0.0/24');
      vpcTerraformResource.attribute(
        'tags',
        terraform.jsonencode({
          Environment: terraform.raw(`${varEnvironment.ref}.name`),
          Name: terraform.raw(`${varEnvironment.ref}.name`),
        }),
      );

      const vpcSubnetBlock = vpcTerraformResource.block('dynamic "subnet"');
      vpcSubnetBlock.attribute('for_each', varSubnetCidrList.ref);
      vpcSubnetBlock.attribute(
        'content',
        terraform.jsonencode({
          availability_zone: 'us-east-1a',
          cidr_block: terraform.raw('subnet.value'),
        }),
      );

      igwTerraformResource.attribute('vpc_id', terraform.raw(`${vpcTerraformResource.address}.id`));
      igwTerraformResource.attribute(
        'tags',
        terraform.jsonencode({
          Attributes: terraform.raw(`${varAdditionalTags.ref}.Attributes`),
          Name: terraform.raw(`${varAdditionalTags.ref}.Name`),
          Service: terraform.raw(`${varAdditionalTags.ref}.Service`),
        }),
      );

      const igwRouteBlock = igwTerraformResource.block('route');
      igwRouteBlock.attribute('cidr_block', '0.0.0.0/0');
      igwRouteBlock.attribute('gateway_id', terraform.raw(`${igwTerraformResource.address}.id`));

      igwTerraformResource.output('igw_id', terraform.raw(`${igwTerraformResource.address}.id`));
      igwTerraformResource.output(
        'igw_tags',
        terraform.jsonencode({
          Environment: terraform.raw(`${varEnvironment.ref}.name`),
          Name: terraform.raw(`${varAdditionalTags.ref}.Name`),
        }),
      );
      vpcTerraformResource.output('vpc_id', terraform.raw(`${vpcTerraformResource.address}.id`));
      vpcTerraformResource.output('vpc_cidr', terraform.raw(`${vpcTerraformResource.address}.cidr_block`));
      vpcTerraformResource.output('vpc_subnet_count', terraform.raw(`length(${varSubnetCidrList.ref})`));

      const originalRendered = terraform.render();
      const serialized = terraform.serialize();
      const deserialized = OctoTerraform.deserialize(serialized);
      const deserializedRendered = deserialized.render();

      expect(deserializedRendered).toEqual(originalRendered);
    });

    it('should serialize and deserialize complex resources correctly', async () => {
      const varClusterConfig = terraform.variable(
        'cluster_config',
        terraform.type({
          name: 'string',
          nodes: 'number',
          settings: {
            enabled: 'bool',
            version: 'any',
          },
          tags: ['string'],
        }),
        {
          default: { name: 'primary', nodes: 3, settings: { enabled: true, version: 1.2 }, tags: ['prod'] },
          sensitive: false,
        },
      );

      vpcTerraformResource.attribute('cidr_block', '10.0.0.0/16');
      const timeoutBlock = vpcTerraformResource.block('timeouts');
      timeoutBlock.attribute('create', '10m');
      const nestedMetaBlock = timeoutBlock.block('nested_meta');
      nestedMetaBlock.attribute('key', terraform.raw(varClusterConfig.ref));

      igwTerraformResource.attribute('vpc_id', terraform.raw(vpcTerraformResource.address + '.id'));
      igwTerraformResource.attribute(
        'policy',
        terraform.jsonencode({
          Statement: [
            {
              Action: ['s3:Get*', 's3:List*'],
              Condition: {
                StringEquals: {
                  'aws:SourceVpc': [terraform.raw(vpcTerraformResource.address + '.id')],
                },
              },
              Effect: 'Allow',
              Resource: [
                terraform.raw(`${vpcTerraformResource.address}.arn`),
                {
                  'Fn::Join': ['/', [terraform.raw(`${vpcTerraformResource.address}.arn`), 'objects/*']],
                },
              ],

              Sid: 'VisualEditor0',
            },
          ],
          Version: '2012-10-17',
        }),
      );

      const originalRendered = terraform.render();
      const serialized = terraform.serialize();
      const deserialized = OctoTerraform.deserialize(serialized);
      const deserializedRendered = deserialized.render();

      expect(deserializedRendered).toEqual(originalRendered);
    });
  });
});
