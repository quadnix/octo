import {
  ATerraformResource,
  Diff,
  DiffUtility,
  type MatchingResource,
  Resource,
  ResourceError,
  type TerraformModuleScope,
} from '@quadnix/octo';
import type { EfsSchema } from '../efs/index.schema.js';
import type { SecurityGroupSchema } from '../security-group/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import { EfsMountTargetSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EfsMountTarget>('@octo', 'efs-mount-target', EfsMountTargetSchema)
export class EfsMountTarget extends ATerraformResource<EfsMountTargetSchema, EfsMountTarget> {
  declare parents: [MatchingResource<EfsSchema>, MatchingResource<SubnetSchema>, MatchingResource<SecurityGroupSchema>];
  declare properties: EfsMountTargetSchema['properties'];
  declare response: EfsMountTargetSchema['response'];

  constructor(
    resourceId: string,
    properties: EfsMountTargetSchema['properties'],
    parents: [MatchingResource<EfsSchema>, MatchingResource<SubnetSchema>, MatchingResource<SecurityGroupSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: EfsMountTarget): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update EFS Mount Target immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const efsMountTargetOctoResource = terraform.addOctoTerraformResource(this as EfsMountTarget, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const efsMountTargetTFResource = efsMountTargetOctoResource.addTerraformResource(
      'aws_efs_mount_target',
      this.resourceId,
      {
        file_system_id: terraform.getRef(this.parents[0], 'FileSystemId'),
        security_groups: [terraform.getRef(this.parents[2], 'GroupId')],
        subnet_id: terraform.getRef(this.parents[1], 'SubnetId'),
      },
    );
    efsMountTargetOctoResource.output({
      MountTargetId: terraform.raw(`${efsMountTargetTFResource.address}.id`),
      NetworkInterfaceId: terraform.raw(`${efsMountTargetTFResource.address}.network_interface_id`),
    });

    if (Object.keys(this.tags).length > 0) {
      efsMountTargetTFResource.attribute('tags', this.tags);
    }
  }
}
