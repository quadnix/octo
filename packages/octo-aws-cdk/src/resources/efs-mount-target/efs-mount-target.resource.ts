import { AResource, Resource } from '@quadnix/octo';
import type { Subnet } from '../subnet/index.js';
import type { Efs } from '../efs/index.js';
import { EfsMountTargetSchema } from './efs-mount-target.schema.js';

@Resource<EfsMountTarget>('@octo', 'efs-mount-target', EfsMountTargetSchema)
export class EfsMountTarget extends AResource<EfsMountTargetSchema, EfsMountTarget> {
  declare properties: EfsMountTargetSchema['properties'];
  declare response: EfsMountTargetSchema['response'];

  constructor(resourceId: string, properties: EfsMountTargetSchema['properties'], parents: [Efs, Subnet]) {
    super(resourceId, properties, parents);
  }
}
