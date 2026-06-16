import {
  ATerraformResource,
  Diff,
  DiffUtility,
  Resource,
  ResourceError,
  type TerraformModuleScope,
} from '@quadnix/octo';
import { VpcSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Vpc>('@octo', 'vpc', VpcSchema)
export class Vpc extends ATerraformResource<VpcSchema, Vpc> {
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

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const vpcOctoResource = terraform.addOctoTerraformResource(this as Vpc, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const vpcTFResource = vpcOctoResource.addTerraformResource('aws_vpc', this.resourceId, {
      cidr_block: this.properties.CidrBlock,
      enable_dns_hostnames: true,
      enable_dns_support: true,
      instance_tenancy: this.properties.InstanceTenancy,
    });
    vpcOctoResource.output({
      VpcArn: terraform.raw(`${vpcTFResource.address}.arn`),
      VpcId: terraform.raw(`${vpcTFResource.address}.id`),
    });

    if (Object.keys(this.tags).length > 0) {
      vpcTFResource.attribute('tags', this.tags);
    }
  }
}
