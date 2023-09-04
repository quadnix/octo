import { IResource, Resource } from '@quadnix/octo';
import { Vpc } from '../vpc/vpc.resource';
import { ISubnetProperties } from './subnet.interface';

export class Subnet extends Resource<Subnet> {
  readonly MODEL_NAME: string = 'subnet';

  constructor(resourceId: string, properties: ISubnetProperties, parents: [Vpc]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
