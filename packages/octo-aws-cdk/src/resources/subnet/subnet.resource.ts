import { AResource, Resource } from '@quadnix/octo';
import type { Vpc } from '../vpc/vpc.resource.js';
import type { ISubnetProperties, ISubnetResponse } from './subnet.interface.js';

@Resource()
export class Subnet extends AResource<Subnet> {
  readonly MODEL_NAME: string = 'subnet';

  declare properties: ISubnetProperties;
  declare response: ISubnetResponse;

  constructor(resourceId: string, properties: ISubnetProperties, parents: [Vpc]) {
    super(resourceId, properties, parents);
  }
}
