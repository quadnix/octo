import { Diff, DiffUtility, type MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../factories/octo-terraform.factory.js';
import type { EfsSchema } from '../efs/index.schema.js';
import type { SecurityGroupSchema } from '../security-group/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import { ATFResource } from '../tf-resource.abstract.js';
import { EfsMountTargetSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EfsMountTarget>('@octo', 'efs-mount-target', EfsMountTargetSchema)
export class EfsMountTarget extends ATFResource<EfsMountTargetSchema, EfsMountTarget> {
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

  override async toHCL(): Promise<void> {
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const efsMountTargetOctoResource = octoTerraform.addOctoTerraformResource(this as EfsMountTarget);

    const efsMountTargetTFResource = efsMountTargetOctoResource.addTerraformResource(
      'aws_efs_mount_target',
      this.resourceId,
      {
        file_system_id: octoTerraform.getRef(this.parents[0], 'FileSystemId'),
        security_groups: [octoTerraform.getRef(this.parents[2], 'GroupId')],
        subnet_id: octoTerraform.getRef(this.parents[1], 'SubnetId'),
      },
    );
    efsMountTargetOctoResource.output({
      MountTargetId: octoTerraform.raw(`${efsMountTargetTFResource.address}.id`),
      NetworkInterfaceId: octoTerraform.raw(`${efsMountTargetTFResource.address}.network_interface_id`),
    });

    if (Object.keys(this.tags).length > 0) {
      efsMountTargetTFResource.attribute('tags', this.tags);
    }
  }
}
