import { AResource, type IResource, Resource } from '@quadnix/octo';
import type { Subnet } from '../subnet/subnet.resource.js';
import type { IEfsMountTargetProperties } from './efs-mount-target.interface.js';
import type { Efs } from './efs.resource.js';

@Resource()
export class EfsMountTarget extends AResource<EfsMountTarget> {
  readonly MODEL_NAME: string = 'efs-mount-target';

  constructor(resourceId: string, properties: IEfsMountTargetProperties, parents: [Efs, Subnet]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
