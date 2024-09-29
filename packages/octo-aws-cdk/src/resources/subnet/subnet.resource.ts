import { AResource, Resource } from '@quadnix/octo';
import type { Vpc } from '../vpc/index.js';
import type { ISubnetProperties, ISubnetResponse } from './subnet.interface.js';

@Resource('@octo', 'subnet')
export class Subnet extends AResource<Subnet> {
  declare properties: ISubnetProperties;
  declare response: ISubnetResponse;

  constructor(resourceId: string, properties: ISubnetProperties, parents: [Vpc]) {
    super(resourceId, properties, parents);
  }
}
