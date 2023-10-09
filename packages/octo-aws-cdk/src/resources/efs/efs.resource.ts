import { IResource, Resource } from '@quadnix/octo';
import { SecurityGroup } from '../security-groups/security-group.resource';
import { Subnet } from '../subnet/subnet.resource';
import { IEfsProperties } from './efs.interface';

export class Efs extends Resource<Efs> {
  readonly MODEL_NAME: string = 'efs';

  constructor(resourceId: string, properties: IEfsProperties, parents: [Subnet, SecurityGroup]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
