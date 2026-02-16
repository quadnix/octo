import { AResource, Diff, DiffUtility, type MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import type { EfsSchema } from '../efs/index.schema.js';
import type { SecurityGroupSchema } from '../security-group/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import { EfsMountTargetSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EfsMountTarget>('@octo', 'efs-mount-target', EfsMountTargetSchema)
export class EfsMountTarget extends AResource<EfsMountTargetSchema, EfsMountTarget> {
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
}
