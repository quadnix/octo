import { Diff, DiffUtility, Resource, ResourceError } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../factories/octo-terraform.factory.js';
import { ATFResource } from '../tf-resource.abstract.js';
import { VpcSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Vpc>('@octo', 'vpc', VpcSchema)
export class Vpc extends ATFResource<VpcSchema, Vpc> {
  declare properties: VpcSchema['properties'];
  declare response: VpcSchema['response'];

  constructor(resourceId: string, properties: VpcSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(previous: Vpc): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update VPC immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  override async toHCL(): Promise<void> {
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const vpcOctoResource = octoTerraform.addOctoTerraformResource(this as Vpc);

    const vpcTFResource = vpcOctoResource.addTerraformResource('aws_vpc', this.resourceId, {
      cidr_block: this.properties.CidrBlock,
      enable_dns_hostnames: true,
      enable_dns_support: true,
      instance_tenancy: this.properties.InstanceTenancy,
    });
    vpcOctoResource.output({
      VpcArn: octoTerraform.raw(`${vpcTFResource.address}.arn`),
      VpcId: octoTerraform.raw(`${vpcTFResource.address}.id`),
    });

    if (Object.keys(this.tags).length > 0) {
      vpcTFResource.attribute('tags', this.tags);
    }
  }
}
