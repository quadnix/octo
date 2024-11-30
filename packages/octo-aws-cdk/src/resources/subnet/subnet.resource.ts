import { AResource, Resource } from '@quadnix/octo';
import type { Vpc } from '../vpc/index.js';
import { SubnetSchema } from './subnet.schema.js';

@Resource<Subnet>('@octo', 'subnet', SubnetSchema)
export class Subnet extends AResource<SubnetSchema, Subnet> {
  declare properties: SubnetSchema['properties'];
  declare response: SubnetSchema['response'];

  constructor(resourceId: string, properties: SubnetSchema['properties'], parents: [Vpc]) {
    super(resourceId, properties, parents);
  }
}
