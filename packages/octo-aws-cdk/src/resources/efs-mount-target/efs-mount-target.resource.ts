import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import type { EfsSchema } from '../efs/efs.schema.js';
import type { SubnetSchema } from '../subnet/subnet.schema.js';
import { EfsMountTargetSchema } from './efs-mount-target.schema.js';

@Resource<EfsMountTarget>('@octo', 'efs-mount-target', EfsMountTargetSchema)
export class EfsMountTarget extends AResource<EfsMountTargetSchema, EfsMountTarget> {
  declare parents: [MatchingResource<EfsSchema>, MatchingResource<SubnetSchema>];
  declare properties: EfsMountTargetSchema['properties'];
  declare response: EfsMountTargetSchema['response'];

  constructor(
    resourceId: string,
    properties: EfsMountTargetSchema['properties'],
    parents: [MatchingResource<EfsSchema>, MatchingResource<SubnetSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
