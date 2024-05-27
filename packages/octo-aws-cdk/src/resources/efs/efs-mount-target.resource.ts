import { AResource, IResource, Resource } from '@quadnix/octo';
import { SecurityGroup } from '../security-group/security-group.resource.js';
import { Subnet } from '../subnet/subnet.resource.js';
import { IEfsMountTargetProperties } from './efs-mount-target.interface.js';
import { Efs } from './efs.resource.js';

@Resource()
export class EfsMountTarget extends AResource<EfsMountTarget> {
  readonly MODEL_NAME: string = 'efs-mount-target';

  constructor(resourceId: string, properties: IEfsMountTargetProperties, parents: [Efs, Subnet, SecurityGroup]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
