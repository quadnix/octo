import { AResource, Resource } from '@quadnix/octo';
import type { Subnet } from '../subnet/index.js';
import type { IEfsMountTargetProperties, IEfsMountTargetResponse } from './efs-mount-target.interface.js';
import type { Efs } from '../efs/index.js';

@Resource('@octo', 'efs-mount-target')
export class EfsMountTarget extends AResource<EfsMountTarget> {
  declare properties: IEfsMountTargetProperties;
  declare response: IEfsMountTargetResponse;

  constructor(resourceId: string, properties: IEfsMountTargetProperties, parents: [Efs, Subnet]) {
    super(resourceId, properties, parents);
  }
}
