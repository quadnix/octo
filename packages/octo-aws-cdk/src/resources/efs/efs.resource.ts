import { AResource, IResource, Resource } from '@quadnix/octo';
import { SecurityGroup } from '../security-groups/security-group.resource.js';
import { Subnet } from '../subnet/subnet.resource.js';
import { IEfsProperties } from './efs.interface.js';

@Resource()
export class Efs extends AResource<Efs> {
  readonly MODEL_NAME: string = 'efs';

  constructor(resourceId: string, properties: IEfsProperties, parents: [Subnet, SecurityGroup]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
