import { NodeType, type UnknownResource } from '../../app.type.js';
import { AResource } from '../../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../../resources/resource.schema.js';
import { createTerraformResource } from '../../utilities/test-helpers/test-resources.js';
import { TerraformService } from './terraform.service.js';

const TestTfResource = createTerraformResource('test-tf-resource');

class TestExternalResource extends AResource<BaseResourceSchema, TestExternalResource> {
  static override readonly NODE_NAME: string = 'test-sdk-resource';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  constructor(resourceId: string, properties: BaseResourceSchema['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }
}

describe('TerraformService UT', () => {
  let service: TerraformService;

  beforeEach(() => {
    service = new TerraformService('octo --mode=run-action', 2);
  });

  // ── Stage 1: Global setup ─────────────────────────────────────────────────

  describe('addTerraformConfig()', () => {
    it('should use the default required_version when addTerraformConfig is never called', () => {
      const scope = service.scope('m1');
      const bucket = new TestTfResource('bucket-1', {});
      scope.addOctoTerraformResource(bucket).addTerraformResource('aws_s3_bucket', 'bucket-1', {});

      expect(service.renderAllModules().get('m1')!.mainTf).toContain('required_version = ">= 1.6.0"');
    });

    it('should use a custom minimum terraform version in the config block', () => {
      service.addTerraformConfig({ minTerraformVersion: '1.9.0', providers: { aws: { source: 'hashicorp/aws' } } });
      service.addTerraformProvider('aws', '111111111', 'us-east-1');

      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      scope
        .addOctoTerraformResource(vpc, { provider: { accountId: '111111111', regionId: 'us-east-1' } })
        .addTerraformResource('aws_vpc', 'vpc-1', {});

      expect(service.renderAllModules().get('m1')!.mainTf).toContain('required_version = ">= 1.9.0"');
    });

    it('should merge required_providers from successive addTerraformConfig calls', () => {
      service.addTerraformConfig({ providers: { aws: { minVersion: '5.0', source: 'hashicorp/aws' } } });
      service.addTerraformConfig({ providers: { aws: { minVersion: '6.0', source: 'hashicorp/aws' } } });
      service.addTerraformProvider('aws', '111111111', 'us-east-1');

      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      scope
        .addOctoTerraformResource(vpc, { provider: { accountId: '111111111', regionId: 'us-east-1' } })
        .addTerraformResource('aws_vpc', 'vpc-1', {});

      const mainTf = service.renderAllModules().get('m1')!.mainTf;
      expect(mainTf).toContain('version = ">= 6.0"');
      expect(mainTf).not.toContain('>= 5.0');
    });
  });

  describe('addTerraformProvider()', () => {
    it('should register a provider block with alias and region', () => {
      service.addTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
      service.addTerraformProvider('aws', '111111111', 'us-east-1');

      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      scope
        .addOctoTerraformResource(vpc, { provider: { accountId: '111111111', regionId: 'us-east-1' } })
        .addTerraformResource('aws_vpc', 'vpc-1', {});

      const mainTf = service.renderAllModules().get('m1')!.mainTf;
      expect(mainTf).toContain('provider "aws"');
      expect(mainTf).toContain('alias = "111111111-us-east-1"');
      expect(mainTf).toContain('region = "us-east-1"');
    });

    it('should skip the region attribute when setRegionAttribute is false', () => {
      service.addTerraformConfig({ providers: { azurerm: { source: 'hashicorp/azurerm' } } });
      service.addTerraformProvider('azurerm', 'sub-1', 'east-us', { features: {} }, { setRegionAttribute: false });

      const scope = service.scope('azure-module');
      const resourceGroup = new TestTfResource('rg-1', {});
      scope
        .addOctoTerraformResource(resourceGroup, { provider: { accountId: 'sub-1', regionId: 'east-us' } })
        .addTerraformResource('azurerm_resource_group', 'rg-1', { name: 'rg-1' });

      const mainTf = service.renderAllModules().get('azure-module')!.mainTf;
      expect(mainTf).toContain('provider "azurerm"');
      expect(mainTf).not.toContain('region');
    });

    it('should not duplicate provider blocks on repeated calls with the same key', () => {
      service.addTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
      service.addTerraformProvider('aws', '111111111', 'us-east-1');
      service.addTerraformProvider('aws', '111111111', 'us-east-1');

      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      scope
        .addOctoTerraformResource(vpc, { provider: { accountId: '111111111', regionId: 'us-east-1' } })
        .addTerraformResource('aws_vpc', 'vpc-1', {});

      expect(
        service
          .renderAllModules()
          .get('m1')!
          .mainTf.match(/provider "aws"/g)?.length,
      ).toBe(1);
    });

    it('should throw when the provider type is not declared in addTerraformConfig', () => {
      expect(() => service.addTerraformProvider('aws', '111111111', 'us-east-1')).toThrow(
        'Provider type "aws" is not configured! Call registerTerraformConfig() with a "aws" entry before registering providers.',
      );
    });

    it('should leave no state behind when the call fails so a correct call afterward wins', () => {
      expect(() => service.addTerraformProvider('aws', '111111111', 'us-east-1')).toThrow(
        'Provider type "aws" is not configured!',
      );

      service.addTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
      service.addTerraformProvider('aws', '111111111', 'us-east-1', { profile: 'production' });

      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      scope
        .addOctoTerraformResource(vpc, { provider: { accountId: '111111111', regionId: 'us-east-1' } })
        .addTerraformResource('aws_vpc', 'vpc-1', {});

      expect(service.renderAllModules().get('m1')!.mainTf).toContain('profile = "production"');
    });

    it('should render multiple provider types in the same module', () => {
      service.addTerraformConfig({
        minTerraformVersion: '1.6.0',
        providers: {
          aws: { minVersion: '5.49', source: 'hashicorp/aws' },
          google: { minVersion: '5.0', source: 'hashicorp/google' },
        },
      });
      service.addTerraformProvider('aws', '111111111', 'us-east-1');
      service.addTerraformProvider('google', 'my-project', 'us-central1');

      const scope = service.scope('region-module');

      const vpc = new TestTfResource('vpc-1', { CidrBlock: '10.0.0.0/16' });
      const vpcTf = scope.addOctoTerraformResource(vpc, {
        provider: { accountId: '111111111', regionId: 'us-east-1' },
      });
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', { cidr_block: '10.0.0.0/16' });
      vpcTf.output({ VpcId: scope.raw('aws_vpc.vpc-1.id') });

      const network = new TestTfResource('network-1', {});
      scope
        .addOctoTerraformResource(network, { provider: { accountId: 'my-project', regionId: 'us-central1' } })
        .addTerraformResource('google_compute_network', 'network-1', { name: 'network-1' });

      expect(service.renderAllModules().get('region-module')!.mainTf).toMatchSnapshot();
    });
  });

  // ── Stage 2: Module creation ───────────────────────────────────────────────

  describe('scope() / getModuleIds()', () => {
    it('should return an empty array before any scope method is used', () => {
      expect(service.getModuleIds()).toEqual([]);
    });

    it('should return all registered module IDs in insertion order', () => {
      const bucket = new TestTfResource('bucket-1', {});
      service.scope('module-z').addOctoTerraformResource(bucket).addTerraformResource('aws_s3_bucket', 'bucket-1', {});

      const queue = new TestTfResource('queue-1', {});
      service.scope('module-a').addOctoTerraformResource(queue).addTerraformResource('aws_queue', 'queue-1', {});

      const table = new TestTfResource('table-1', {});
      service
        .scope('module-m')
        .addOctoTerraformResource(table)
        .addTerraformResource('aws_dynamodb_table', 'table-1', {});

      expect(service.getModuleIds()).toEqual(['module-z', 'module-a', 'module-m']);
    });
  });

  // ── Stage 3: Registering resources ────────────────────────────────────────

  describe('addOctoTerraformResource()', () => {
    it('should register the resource so it is addressable by other resources', () => {
      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcId: scope.raw('aws_vpc.vpc-1.id') });

      const mappings = service.getOctoTerraformResourceMappings();
      expect(mappings).toHaveLength(1);
      expect(mappings[0].resourceId).toBe('vpc-1');
      expect(mappings[0].terraformAddresses).toEqual(['aws_vpc.vpc-1']);
    });

    it('should pin the resource to a provider context via options.provider', () => {
      service.addTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
      service.addTerraformProvider('aws', '111111111', 'us-east-1');

      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      scope
        .addOctoTerraformResource(vpc, { provider: { accountId: '111111111', regionId: 'us-east-1' } })
        .addTerraformResource('aws_vpc', 'vpc-1', {});

      expect(service.renderAllModules().get('m1')!.mainTf).toContain('provider = aws.111111111-us-east-1');
    });

    it('should throw when the target provider is not registered', () => {
      const vpc = new TestTfResource('vpc-1', {});
      expect(() =>
        service
          .scope('m1')
          .addOctoTerraformResource(vpc, { provider: { accountId: '111111111', regionId: 'us-east-1' } }),
      ).toThrow('No provider registered for account "111111111" and region "us-east-1"!');
    });

    it('should throw when the same resource ID is registered twice', () => {
      const scope = service.scope('m1');
      scope.addOctoTerraformResource(new TestTfResource('vpc-1', {}));

      expect(() => scope.addOctoTerraformResource(new TestTfResource('vpc-1', {}))).toThrow(
        'Resource id "vpc-1" is already registered!',
      );
    });

    it('should throw when two distinct resource IDs collide after sanitization', () => {
      const scope = service.scope('m1');
      scope.addOctoTerraformResource(new TestTfResource('vpc/1', {}));

      expect(() => scope.addOctoTerraformResource(new TestTfResource('vpc-1', {}))).toThrow(
        'Resource id "vpc-1" collides with resource id "vpc/1" after sanitization!',
      );
    });

    it('should add depends_on for explicit parents in the same module', () => {
      const scope = service.scope('m1');

      const vpc = new TestTfResource('vpc-1', {});
      scope.addOctoTerraformResource(vpc).addTerraformResource('aws_vpc', 'vpc-1', {});

      const internetGateway = new TestTfResource('igw-1', {});
      scope
        .addOctoTerraformResource(internetGateway, { explicitParents: [vpc] })
        .addTerraformResource('aws_internet_gateway', 'igw-1', {});

      expect(service.renderAllModules().get('m1')!.mainTf).toContain('depends_on = [aws_vpc.vpc-1]');
    });

    it('should add a terragrunt dependency for cross-module explicit parents without depends_on', () => {
      const vpcScope = service.scope('vpc-module');
      const vpc = new TestTfResource('vpc-1', {});
      vpcScope.addOctoTerraformResource(vpc).addTerraformResource('aws_vpc', 'vpc-1', {});

      const igwScope = service.scope('igw-module');
      const internetGateway = new TestTfResource('igw-1', {});
      igwScope
        .addOctoTerraformResource(internetGateway, { explicitParents: [vpc] })
        .addTerraformResource('aws_internet_gateway', 'igw-1', {});

      const files = service.renderAllModules();
      expect(files.get('igw-module')!.terragruntHcl).toContain('dependency "vpc-module"');
      expect(files.get('igw-module')!.terragruntHcl).not.toContain('inputs');
      expect(files.get('igw-module')!.mainTf).not.toContain('depends_on');
      expect(files.get('igw-module')!.variablesTf).toBe('');
    });

    it('should throw when an explicit parent is not registered in terraform', () => {
      const scope = service.scope('m1');
      const phantomVpc = new TestTfResource('phantom-vpc-1', {});

      const subnet = new TestTfResource('subnet-1', {});
      scope
        .addOctoTerraformResource(subnet, { explicitParents: [phantomVpc] })
        .addTerraformResource('aws_subnet', 'subnet-1', {});

      expect(() => service.renderAllModules()).toThrow(
        'Explicit parent "phantom-vpc-1" of resource "subnet-1" is not registered in Terraform!',
      );
    });
  });

  describe('addOctoTerraformExternalResource()', () => {
    it('should generate the null_resource and data external wrapper with cross-module inputs', () => {
      const vpcScope = service.scope('vpc-module');
      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = vpcScope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcId: vpcScope.raw('aws_vpc.vpc-1.id') });

      const igwScope = service.scope('igw-module');
      const internetGateway = new TestExternalResource('igw-1', { someProperty: 'value' }, [vpc]);
      igwScope.addOctoTerraformExternalResource(internetGateway);

      const files = service.renderAllModules();
      expect(files.get('igw-module')!.mainTf).toMatchSnapshot();
      expect(files.get('igw-module')!.outputsTf).toMatchSnapshot();
      expect(files.get('igw-module')!.variablesTf).toContain('variable "vpc_1_VpcId" {}');
      expect(files.get('igw-module')!.terragruntHcl).toContain('dependency "vpc-module"');
    });

    it('should resolve a ref to an external resource by indexing its whole result map', () => {
      const scope = service.scope('m1');

      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcId: scope.raw('aws_vpc.vpc-1.id') });

      const internetGateway = new TestExternalResource('igw-1', {}, [vpc]);
      scope.addOctoTerraformExternalResource(internetGateway);

      const securityGroup = new TestTfResource('sg-1', {});
      scope
        .addOctoTerraformResource(securityGroup)
        .addTerraformResource('aws_security_group', 'sg-1', { igw_id: scope.getRef(internetGateway, 'igwId') });

      expect(service.renderAllModules().get('m1')!.mainTf).toContain('igw_id = data.external.igw-1.result.igwId');
    });

    it('should throw when an external resource parent is never registered in terraform', () => {
      const vpc = new TestTfResource('vpc-1', {});
      const internetGateway = new TestExternalResource('igw-1', {}, [vpc]);

      // Parent-input wiring is deferred to the render phase, so registration succeeds; the missing
      // parent surfaces when wiring is resolved.
      service.scope('m1').addOctoTerraformExternalResource(internetGateway);

      expect(() => service.renderAllModules()).toThrow(
        'Parent resource "vpc-1" of external resource "igw-1" is not registered with Terraform!',
      );
    });

    it('should resolve parent inputs inline when parent is in the same module', () => {
      const scope = service.scope('m1');

      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcId: scope.raw('aws_vpc.vpc-1.id') });

      const internetGateway = new TestExternalResource('igw-1', { someProperty: 'value' }, [vpc]);
      scope.addOctoTerraformExternalResource(internetGateway);

      const { mainTf, variablesTf, terragruntHcl } = service.renderAllModules().get('m1')!;
      expect(mainTf).toMatchSnapshot();
      expect(variablesTf).toBe('');
      expect(terragruntHcl.trim()).toBe('');
    });

    it('should include null and external providers in required_providers', () => {
      const internetGateway = new TestExternalResource('igw-1', {});
      service.scope('m1').addOctoTerraformExternalResource(internetGateway);

      const mainTf = service.renderAllModules().get('m1')!.mainTf;
      expect(mainTf).toContain('hashicorp/null');
      expect(mainTf).toContain('hashicorp/external');
    });

    it('should feed an external parent\'s whole result into a child external resource as one input (same module)', () => {
      const scope = service.scope('m1');

      const igw = new TestExternalResource('igw-1', {});
      scope.addOctoTerraformExternalResource(igw);

      const nat = new TestExternalResource('nat-1', {}, [igw]);
      scope.addOctoTerraformExternalResource(nat);

      const mainTf = service.renderAllModules().get('m1')!.mainTf;
      // The parent's keys are unknown at generation time, so the entire result map is handed over as
      // a single jsonencode'd input, keyed bare by the parent id (no per-key suffix).
      expect(mainTf).toContain('--input igw-1=${jsonencode(data.external.igw-1.result)}');
      expect(mainTf).toContain('input_igw_1 = "${jsonencode(data.external.igw-1.result)}"');
    });

    it('should wire an external parent\'s whole result into a child external resource across modules', () => {
      const igw = new TestExternalResource('igw-1', {});
      service.scope('igw-module').addOctoTerraformExternalResource(igw);

      const nat = new TestExternalResource('nat-1', {}, [igw]);
      service.scope('nat-module').addOctoTerraformExternalResource(nat);

      const files = service.renderAllModules();
      // Cross module: one variable carries the parent's whole result map, sourced via terragrunt from
      // the parent's single output, and consumed whole (jsonencode) in the child's input.
      expect(files.get('nat-module')!.mainTf).toContain('--input igw-1=${jsonencode(var.igw_1)}');
      expect(files.get('nat-module')!.variablesTf).toContain('variable "igw_1" {}');
      expect(files.get('nat-module')!.terragruntHcl).toContain('igw_1 = dependency.igw-module.outputs["igw-1"]');
    });
  });

  describe('addTerraformData()', () => {
    it('should render a standalone data source block in main.tf', () => {
      const scope = service.scope('m1');
      scope.addTerraformData('aws_caller_identity', 'current');

      expect(service.renderAllModules().get('m1')!.mainTf).toContain('data "aws_caller_identity" "current"');
    });

    it('should allow consuming a data source attribute as a resource attribute via ref()', () => {
      const scope = service.scope('m1');
      const callerIdentity = scope.addTerraformData('aws_caller_identity', 'current');

      const policy = new TestTfResource('policy-1', {});
      scope
        .addOctoTerraformResource(policy)
        .addTerraformResource('aws_iam_policy', 'policy-1', { account_id: callerIdentity.ref('account_id') });

      expect(service.renderAllModules().get('m1')!.mainTf).toContain(
        'account_id = data.aws_caller_identity.current.account_id',
      );
    });
  });

  // ── Stage 4: Building specs (scope helpers) ────────────────────────────────

  describe('getRef()', () => {
    it('should resolve same-module refs to native terraform expressions', () => {
      const scope = service.scope('m1');

      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcId: scope.raw('aws_vpc.vpc-1.id') });

      const subnet = new TestTfResource('subnet-1', {});
      scope
        .addOctoTerraformResource(subnet)
        .addTerraformResource('aws_subnet', 'subnet-1', { vpc_id: scope.getRef(vpc, 'VpcId') });

      const files = service.renderAllModules();
      expect(files.get('m1')!.mainTf).toContain('vpc_id = aws_vpc.vpc-1.id');
      expect(files.get('m1')!.variablesTf).toBe('');
      expect(files.get('m1')!.terragruntHcl.trim()).toBe('');
    });

    it('should resolve cross-module refs to variables with terragrunt wiring', () => {
      const vpcScope = service.scope('vpc-module');
      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = vpcScope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcArn: vpcScope.raw('aws_vpc.vpc-1.arn'), VpcId: vpcScope.raw('aws_vpc.vpc-1.id') });

      const subnetScope = service.scope('subnet-module');
      const subnet = new TestTfResource('subnet-1', {});
      subnetScope
        .addOctoTerraformResource(subnet)
        .addTerraformResource('aws_subnet', 'subnet-1', { vpc_id: subnetScope.getRef(vpc, 'VpcId') });

      const files = service.renderAllModules();
      expect(files.get('subnet-module')!.mainTf).toContain('vpc_id = var.vpc_1_VpcId');
      expect(files.get('subnet-module')!.variablesTf).toContain('variable "vpc_1_VpcId" {}');
      expect(files.get('subnet-module')!.terragruntHcl).toMatchSnapshot();
      expect(files.get('vpc-module')!.outputsTf).toContain('output "vpc-1-VpcId"');
    });

    it('should throw on refs to output keys not declared via output()', () => {
      const scope = service.scope('m1');

      const vpc = new TestTfResource('vpc-1', {});
      scope.addOctoTerraformResource(vpc).addTerraformResource('aws_vpc', 'vpc-1', {});

      const subnet = new TestTfResource('subnet-1', {});
      scope
        .addOctoTerraformResource(subnet)
        .addTerraformResource('aws_subnet', 'subnet-1', { vpc_id: scope.getRef(vpc, 'VpcId') });

      expect(() => service.renderAllModules()).toThrow(
        'Ref "VpcId" not registered for resource "vpc-1" in Octo Terraform!',
      );
    });
  });

  describe('getProviderAliasRef()', () => {
    it('should register provider usage so the provider block renders in the module config', () => {
      service.addTerraformConfig({ providers: { aws: { source: 'hashicorp/aws' } } });
      service.addTerraformProvider('aws', '222222222', 'us-west-2');

      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      scope
        .addOctoTerraformResource(vpc)
        .addTerraformResource('aws_vpc', 'vpc-1', { provider: scope.getProviderAliasRef('222222222', 'us-west-2') });

      const mainTf = service.renderAllModules().get('m1')!.mainTf;
      expect(mainTf).toContain('provider = aws.222222222-us-west-2');
      expect(mainTf).toContain('provider "aws"');
      expect(mainTf).toContain('hashicorp/aws');
    });
  });

  describe('raw()', () => {
    it('should emit the value verbatim as an unquoted terraform expression', () => {
      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      scope
        .addOctoTerraformResource(vpc)
        .addTerraformResource('aws_vpc', 'vpc-1', { tags: scope.raw('local.common_tags') });

      expect(service.renderAllModules().get('m1')!.mainTf).toContain('tags = local.common_tags');
    });
  });

  describe('type()', () => {
    it('should render a list type expression correctly in a variable declaration', () => {
      const scope = service.scope('m1');
      scope.variable('subnet_ids', scope.type(['string']), { default: null, sensitive: false });

      expect(service.renderAllModules().get('m1')!.variablesTf).toContain('type = list(string)');
    });
  });

  describe('jsonencode()', () => {
    it('should render a plain object wrapped in jsonencode(...)', () => {
      const scope = service.scope('m1');
      const iamPolicy = new TestTfResource('policy-1', {});
      scope.addOctoTerraformResource(iamPolicy).addTerraformResource('aws_iam_policy', 'policy-1', {
        policy: scope.jsonencode({ Statement: [], Version: '2012-10-17' }),
      });

      expect(service.renderAllModules().get('m1')!.mainTf).toMatchSnapshot();
    });

    it('should resolve HCL refs embedded inside jsonencode arguments', () => {
      const scope = service.scope('m1');

      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcId: scope.raw('aws_vpc.vpc-1.id') });

      const securityGroup = new TestTfResource('sg-1', {});
      scope.addOctoTerraformResource(securityGroup).addTerraformResource('aws_sg', 'sg-1', {
        policy: scope.jsonencode({ vpc_id: scope.getRef(vpc, 'VpcId') }),
      });

      expect(service.renderAllModules().get('m1')!.mainTf).toContain('vpc_id = aws_vpc.vpc-1.id');
    });
  });

  describe('mapAttr()', () => {
    it('should render as a map attribute (key = { }) not a block (key { })', () => {
      const scope = service.scope('m1');
      const instance = new TestTfResource('instance-1', {});
      scope.addOctoTerraformResource(instance).addTerraformResource('aws_instance', 'instance-1', {
        tags: scope.mapAttr({ Env: 'prod', Name: 'my-instance' }),
      });

      const mainTf = service.renderAllModules().get('m1')!.mainTf;
      expect(mainTf).toContain('tags = {');
      expect(mainTf).not.toMatch(/tags \{[^=]/);
      expect(mainTf).toContain('Name = "my-instance"');
      expect(mainTf).toContain('Env = "prod"');
    });
  });

  describe('variable()', () => {
    it('should render a string variable with default and sensitive flag', () => {
      const scope = service.scope('m1');
      scope.variable('db_password', 'string', { default: null, sensitive: true });

      expect(service.renderAllModules().get('m1')!.variablesTf).toMatchSnapshot();
    });

    it('should render an object-type variable', () => {
      const scope = service.scope('m1');
      scope.variable('config', { host: 'string', port: 'number' }, { default: null, sensitive: false });

      expect(service.renderAllModules().get('m1')!.variablesTf).toMatchSnapshot();
    });

    it('should expose the variable as a var.name ref consumable in a resource', () => {
      const scope = service.scope('m1');
      const bucketNameVar = scope.variable('bucket_name', 'string', { default: 'my-bucket', sensitive: false });

      const bucket = new TestTfResource('bucket-1', {});
      scope
        .addOctoTerraformResource(bucket)
        .addTerraformResource('aws_s3_bucket', 'bucket-1', { bucket: bucketNameVar.ref });

      expect(service.renderAllModules().get('m1')!.mainTf).toContain('bucket = var.bucket_name');
    });
  });

  // ── Stage 5: Output declarations ───────────────────────────────────────────

  describe('output()', () => {
    it('should register each key so it can be queried via getOctoTerraformResourceMappings', () => {
      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcArn: scope.raw('aws_vpc.vpc-1.arn'), VpcId: scope.raw('aws_vpc.vpc-1.id') });

      expect(service.getOctoTerraformResourceMappings()[0].outputMappings).toEqual([
        { key: 'VpcArn', outputName: 'vpc-1-VpcArn' },
        { key: 'VpcId', outputName: 'vpc-1-VpcId' },
      ]);
    });

    it('should use the sanitized resourceId as the output name prefix', () => {
      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc/us-east-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcId: scope.raw('aws_vpc.vpc-1.id') });

      expect(service.renderAllModules().get('m1')!.outputsTf).toContain('output "vpc_us-east-1-VpcId"');
    });

    it('should render each output value correctly in outputsTf', () => {
      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcId: scope.raw('aws_vpc.vpc-1.id') });

      expect(service.renderAllModules().get('m1')!.outputsTf).toContain('value = aws_vpc.vpc-1.id');
    });
  });

  describe('getOctoTerraformResourceMappings()', () => {
    it('should map each octo resource to its terraform addresses and output names', () => {
      const scope = service.scope('m1');

      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
      vpcTf.output({ VpcId: scope.raw('aws_vpc.vpc-1.id') });

      const internetGateway = new TestExternalResource('igw-1', {}, [vpc]);
      scope.addOctoTerraformExternalResource(internetGateway);

      expect(service.getOctoTerraformResourceMappings()).toEqual([
        {
          moduleId: 'm1',
          outputMappings: [{ key: 'VpcId', outputName: 'vpc-1-VpcId' }],
          resourceContext: vpc.getContext(),
          resourceId: 'vpc-1',
          terraformAddresses: ['aws_vpc.vpc-1'],
        },
        {
          entireResponseOutput: 'igw-1',
          moduleId: 'm1',
          outputMappings: [],
          resourceContext: internetGateway.getContext(),
          resourceId: 'igw-1',
          terraformAddresses: ['null_resource.igw-1'],
        },
      ]);
    });
  });

  // ── Stage 6: Rendering ─────────────────────────────────────────────────────

  describe('renderAllModules()', () => {
    it('should return an empty map when no modules are registered', () => {
      expect(service.renderAllModules().size).toBe(0);
    });

    describe('provider isolation', () => {
      it('should include only the providers used by each module in its config block', () => {
        service.addTerraformConfig({
          providers: {
            aws: { source: 'hashicorp/aws' },
            google: { source: 'hashicorp/google' },
          },
        });
        service.addTerraformProvider('aws', '111111111', 'us-east-1');
        service.addTerraformProvider('google', 'my-project', 'us-central1');

        const awsScope = service.scope('aws-module');
        const vpc = new TestTfResource('vpc-1', {});
        awsScope
          .addOctoTerraformResource(vpc, { provider: { accountId: '111111111', regionId: 'us-east-1' } })
          .addTerraformResource('aws_vpc', 'vpc-1', {});

        const googleScope = service.scope('google-module');
        const network = new TestTfResource('network-1', {});
        googleScope
          .addOctoTerraformResource(network, { provider: { accountId: 'my-project', regionId: 'us-central1' } })
          .addTerraformResource('google_compute_network', 'network-1', {});

        const files = service.renderAllModules();
        expect(files.get('aws-module')!.mainTf).toContain('hashicorp/aws');
        expect(files.get('aws-module')!.mainTf).not.toContain('hashicorp/google');
        expect(files.get('google-module')!.mainTf).toContain('hashicorp/google');
        expect(files.get('google-module')!.mainTf).not.toContain('hashicorp/aws');
      });
    });

    describe('intra-resource depends_on', () => {
      it('should not add depends_on to the first TF block of an octo resource', () => {
        const scope = service.scope('m1');
        const bucket = new TestTfResource('bucket-1', {});
        scope.addOctoTerraformResource(bucket).addTerraformResource('aws_s3_bucket', 'bucket-1', {});

        expect(service.renderAllModules().get('m1')!.mainTf).not.toContain('depends_on');
      });

      it('should chain multiple TF blocks of the same octo resource via depends_on', () => {
        const scope = service.scope('m1');
        const bucket = new TestTfResource('bucket-1', {});
        const bucketTf = scope.addOctoTerraformResource(bucket);
        bucketTf.addTerraformResource('aws_s3_bucket', 'bucket-1', {});
        bucketTf.addTerraformResource('aws_s3_bucket_policy', 'bucket-1-policy', {});

        expect(service.renderAllModules().get('m1')!.mainTf).toMatchSnapshot();
      });

      it('should merge intra-resource and explicit-parent depends_on into a single list', () => {
        const scope = service.scope('m1');

        const vpc = new TestTfResource('vpc-1', {});
        scope.addOctoTerraformResource(vpc).addTerraformResource('aws_vpc', 'vpc-1', {});

        const subnet = new TestTfResource('subnet-1', {});
        const subnetTf = scope.addOctoTerraformResource(subnet, { explicitParents: [vpc] });
        subnetTf.addTerraformResource('aws_subnet', 'subnet-1a', {});
        subnetTf.addTerraformResource('aws_subnet', 'subnet-1b', {});

        const mainTf = service.renderAllModules().get('m1')!.mainTf;
        expect(mainTf).toContain('depends_on = [aws_vpc.vpc-1]');
        expect(mainTf).toContain('depends_on = [aws_vpc.vpc-1, aws_subnet.subnet-1a]');
      });
    });

    describe('cross-module wiring', () => {
      it('should correctly wire a three-level dependency chain', () => {
        const clusterScope = service.scope('cluster-module');
        const clusterResource = new TestTfResource('cluster-1', {});
        const clusterTf = clusterScope.addOctoTerraformResource(clusterResource);
        clusterTf.addTerraformResource('aws_eks_cluster', 'cluster-1', {});
        clusterTf.output({ ClusterId: clusterScope.raw('aws_eks_cluster.cluster-1.id') });

        const nodeGroupScope = service.scope('node-group-module');
        const nodeGroupResource = new TestTfResource('node-group-1', {});
        const nodeGroupTf = nodeGroupScope.addOctoTerraformResource(nodeGroupResource);
        nodeGroupTf.addTerraformResource('aws_eks_node_group', 'node-group-1', {
          cluster_id: nodeGroupScope.getRef(clusterResource, 'ClusterId'),
        });
        nodeGroupTf.output({ NodeGroupId: nodeGroupScope.raw('aws_eks_node_group.node-group-1.id') });

        const addonScope = service.scope('addon-module');
        const addonResource = new TestTfResource('addon-1', {});
        addonScope.addOctoTerraformResource(addonResource).addTerraformResource('aws_eks_addon', 'addon-1', {
          node_group_id: addonScope.getRef(nodeGroupResource, 'NodeGroupId'),
        });

        const files = service.renderAllModules();
        expect(files.get('node-group-module')!.mainTf).toContain('cluster_id = var.cluster_1_ClusterId');
        expect(files.get('node-group-module')!.terragruntHcl).toContain('dependency "cluster-module"');
        expect(files.get('addon-module')!.mainTf).toContain('node_group_id = var.node_group_1_NodeGroupId');
        expect(files.get('addon-module')!.terragruntHcl).toContain('dependency "node-group-module"');
        expect(files.get('addon-module')!.terragruntHcl).not.toContain('dependency "cluster-module"');
      });

      it('should handle a diamond dependency without false cycle errors', () => {
        const vpcScope = service.scope('vpc-module');
        const vpcResource = new TestTfResource('vpc-1', {});
        const vpcTf = vpcScope.addOctoTerraformResource(vpcResource);
        vpcTf.addTerraformResource('aws_vpc', 'vpc-1', {});
        vpcTf.output({ VpcId: vpcScope.raw('aws_vpc.vpc-1.id') });

        const publicSubnetScope = service.scope('public-subnet-module');
        const publicSubnetResource = new TestTfResource('public-subnet-1', {});
        const publicSubnetTf = publicSubnetScope.addOctoTerraformResource(publicSubnetResource);
        publicSubnetTf.addTerraformResource('aws_subnet', 'public-subnet-1', {
          vpc_id: publicSubnetScope.getRef(vpcResource, 'VpcId'),
        });
        publicSubnetTf.output({ SubnetId: publicSubnetScope.raw('aws_subnet.public-subnet-1.id') });

        const privateSubnetScope = service.scope('private-subnet-module');
        const privateSubnetResource = new TestTfResource('private-subnet-1', {});
        const privateSubnetTf = privateSubnetScope.addOctoTerraformResource(privateSubnetResource);
        privateSubnetTf.addTerraformResource('aws_subnet', 'private-subnet-1', {
          vpc_id: privateSubnetScope.getRef(vpcResource, 'VpcId'),
        });
        privateSubnetTf.output({ SubnetId: privateSubnetScope.raw('aws_subnet.private-subnet-1.id') });

        const routeTableScope = service.scope('route-table-module');
        const routeTableResource = new TestTfResource('route-table-1', {});
        routeTableScope
          .addOctoTerraformResource(routeTableResource)
          .addTerraformResource('aws_route_table', 'route-table-1', {
            private_subnet_id: routeTableScope.getRef(privateSubnetResource, 'SubnetId'),
            public_subnet_id: routeTableScope.getRef(publicSubnetResource, 'SubnetId'),
          });

        const files = service.renderAllModules();
        expect(files.get('route-table-module')!.terragruntHcl).toContain('dependency "public-subnet-module"');
        expect(files.get('route-table-module')!.terragruntHcl).toContain('dependency "private-subnet-module"');
      });

      it('should include only consumed outputs as mock_outputs in terragrunt', () => {
        const clusterScope = service.scope('cluster-module');
        const clusterResource = new TestTfResource('cluster-1', {});
        const clusterTf = clusterScope.addOctoTerraformResource(clusterResource);
        clusterTf.addTerraformResource('aws_eks_cluster', 'cluster-1', {});
        clusterTf.output({
          Arn: clusterScope.raw('aws_eks_cluster.cluster-1.arn'),
          Id: clusterScope.raw('aws_eks_cluster.cluster-1.id'),
          Name: clusterScope.raw('aws_eks_cluster.cluster-1.name'),
        });

        const nodeGroupScope = service.scope('node-group-module');
        const nodeGroupResource = new TestTfResource('node-group-1', {});
        nodeGroupScope
          .addOctoTerraformResource(nodeGroupResource)
          .addTerraformResource('aws_eks_node_group', 'node-group-1', {
            cluster_id: nodeGroupScope.getRef(clusterResource, 'Id'),
          });

        const { terragruntHcl, variablesTf } = service.renderAllModules().get('node-group-module')!;
        expect(terragruntHcl).toContain('"cluster-1-Id" = "mock-cluster-1-Id"');
        expect(terragruntHcl).not.toContain('cluster-1-Arn');
        expect(terragruntHcl).not.toContain('cluster-1-Name');
        expect(variablesTf).toContain('variable "cluster_1_Id" {}');
        expect(variablesTf).not.toContain('cluster_1_Arn');
      });

      it('should throw when a cross-module dependency cycle is detected', () => {
        const m1 = service.scope('m1');
        const resourceA = new TestTfResource('resource-a', {});
        const resourceATf = m1.addOctoTerraformResource(resourceA);
        resourceATf.output({ KeyA: m1.raw('resource_a.a.id') });

        const m2 = service.scope('m2');
        const resourceB = new TestTfResource('resource-b', {});
        const resourceBTf = m2.addOctoTerraformResource(resourceB);
        resourceBTf.output({ KeyB: m2.raw('resource_b.b.id') });
        resourceBTf.addTerraformResource('resource_b', 'b', { a_ref: m2.getRef(resourceA, 'KeyA') });

        resourceATf.addTerraformResource('resource_a', 'a', { b_ref: m1.getRef(resourceB, 'KeyB') });

        expect(() => service.renderAllModules()).toThrow(
          'Found cross-module dependency cycle: m1 -> m2 -> m1! ' +
            'Edges: "m1" -> "m2" via ref "resource-b.KeyB"; "m2" -> "m1" via ref "resource-a.KeyA".',
        );
      });
    });

    describe('resource ID sanitization', () => {
      it('should sanitize IDs with special characters across output names, variable names, and TF identifiers', () => {
        const vpcScope = service.scope('vpc-module');
        const vpc = new TestTfResource('vpc/us-east-1/prod', {});
        const vpcTf = vpcScope.addOctoTerraformResource(vpc);
        vpcTf.addTerraformResource('aws_vpc', 'vpc/us-east-1/prod', {});
        vpcTf.output({ VpcId: vpcScope.raw('aws_vpc.vpc_us-east-1_prod.id') });

        const subnetScope = service.scope('subnet-module');
        const subnet = new TestTfResource('subnet-1', {});
        subnetScope
          .addOctoTerraformResource(subnet)
          .addTerraformResource('aws_subnet', 'subnet-1', { vpc_id: subnetScope.getRef(vpc, 'VpcId') });

        const files = service.renderAllModules();
        expect(files.get('vpc-module')!.outputsTf).toContain('output "vpc_us-east-1_prod-VpcId"');
        expect(files.get('subnet-module')!.variablesTf).toContain('variable "vpc_us_east_1_prod_VpcId" {}');
        expect(files.get('subnet-module')!.mainTf).toContain('vpc_id = var.vpc_us_east_1_prod_VpcId');
      });

      it('should throw when two cross-module refs produce the same auto-variable name', () => {
        // "res" + key "a_Id" and "res_a" + key "Id" both sanitize to the same variable name "res_a_Id".
        const producerScope = service.scope('producer-module');

        const resResource = new TestTfResource('res', {});
        const resTf = producerScope.addOctoTerraformResource(resResource);
        resTf.addTerraformResource('aws_resource', 'res', {});
        resTf.output({ a_Id: producerScope.raw('aws_resource.res.id') });

        const resAResource = new TestTfResource('res_a', {});
        const resATf = producerScope.addOctoTerraformResource(resAResource);
        resATf.addTerraformResource('aws_resource', 'res_a', {});
        resATf.output({ Id: producerScope.raw('aws_resource.res_a.id') });

        const consumerScope = service.scope('consumer-module');
        const consumerResource = new TestTfResource('consumer-1', {});
        const consumerTf = consumerScope.addOctoTerraformResource(consumerResource);
        consumerTf.addTerraformResource('aws_resource', 'consumer-1', {
          first_ref: consumerScope.getRef(resResource, 'a_Id'),
          second_ref: consumerScope.getRef(resAResource, 'Id'),
        });

        expect(() => service.renderAllModules()).toThrow(
          'Variable "res_a_Id" maps to both outputs "res-a_Id" and "res_a-Id"! ' +
            'Rename one of the resources or response keys.',
        );
      });
    });
  });

  // ── Stage 7: Lifecycle ─────────────────────────────────────────────────────

  describe('reset()', () => {
    it('should clear all modules so getModuleIds returns empty', () => {
      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.addTerraformResource('aws_resource', 'vpc-1', {});
      vpcTf.output({ VpcId: scope.raw('aws_resource.vpc-1.id') });

      service.reset();

      expect(service.getModuleIds()).toEqual([]);
    });

    it('should make previously-registered resources inaccessible after reset', () => {
      const scope = service.scope('m1');
      const vpc = new TestTfResource('vpc-1', {});
      const vpcTf = scope.addOctoTerraformResource(vpc);
      vpcTf.output({ VpcId: scope.raw('aws_resource.vpc-1.id') });

      service.reset();

      const scope2 = service.scope('m2');
      const subnet = new TestTfResource('subnet-1', {});
      scope2
        .addOctoTerraformResource(subnet)
        .addTerraformResource('aws_resource', 'subnet-1', { dep: scope2.getRef(vpc, 'VpcId') });

      expect(() => service.renderAllModules()).toThrow('Resource "vpc-1" not found in Octo Terraform!');
    });

    it('should clear the sanitized-ID map so a previously-colliding ID can be re-registered', () => {
      const scope = service.scope('m1');
      scope.addOctoTerraformResource(new TestTfResource('vpc/1', {}));
      expect(() => scope.addOctoTerraformResource(new TestTfResource('vpc-1', {}))).toThrow();

      service.reset();

      const scope2 = service.scope('m2');
      expect(() => scope2.addOctoTerraformResource(new TestTfResource('vpc-1', {}))).not.toThrow();
    });
  });
});
