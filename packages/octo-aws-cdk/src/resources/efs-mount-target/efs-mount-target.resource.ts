import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import {
  type EfsMountTargetEfsSchema,
  EfsMountTargetSchema,
  type EfsMountTargetSubnetSchema,
} from './efs-mount-target.schema.js';

@Resource<EfsMountTarget>('@octo', 'efs-mount-target', EfsMountTargetSchema)
export class EfsMountTarget extends AResource<EfsMountTargetSchema, EfsMountTarget> {
  declare parents: [MatchingResource<EfsMountTargetEfsSchema>, MatchingResource<EfsMountTargetSubnetSchema>];
  declare properties: EfsMountTargetSchema['properties'];
  declare response: EfsMountTargetSchema['response'];

  constructor(
    resourceId: string,
    properties: EfsMountTargetSchema['properties'],
    parents: [MatchingResource<EfsMountTargetEfsSchema>, MatchingResource<EfsMountTargetSubnetSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
