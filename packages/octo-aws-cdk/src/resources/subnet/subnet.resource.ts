import { AResource, Resource } from '@quadnix/octo';
import type { IResource } from '@quadnix/octo';
import type { Vpc } from '../vpc/vpc.resource.js';
import type { ISubnetProperties } from './subnet.interface.js';

@Resource()
export class Subnet extends AResource<Subnet> {
  readonly MODEL_NAME: string = 'subnet';

  constructor(resourceId: string, properties: ISubnetProperties, parents: [Vpc]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
