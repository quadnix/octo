import { AResource, Resource } from '@quadnix/octo';
import { type EfsMountTargetEfs, EfsMountTargetSchema, type EfsMountTargetSubnet } from './efs-mount-target.schema.js';

@Resource<EfsMountTarget>('@octo', 'efs-mount-target', EfsMountTargetSchema)
export class EfsMountTarget extends AResource<EfsMountTargetSchema, EfsMountTarget> {
  declare properties: EfsMountTargetSchema['properties'];
  declare response: EfsMountTargetSchema['response'];

  constructor(
    resourceId: string,
    properties: EfsMountTargetSchema['properties'],
    parents: [EfsMountTargetEfs, EfsMountTargetSubnet],
  ) {
    super(resourceId, properties, parents);
  }
}
