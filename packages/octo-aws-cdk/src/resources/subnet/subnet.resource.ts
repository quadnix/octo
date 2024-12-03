import { AResource, Resource } from '@quadnix/octo';
import { SubnetSchema, type SubnetVpc } from './subnet.schema.js';

@Resource<Subnet>('@octo', 'subnet', SubnetSchema)
export class Subnet extends AResource<SubnetSchema, Subnet> {
  declare properties: SubnetSchema['properties'];
  declare response: SubnetSchema['response'];

  constructor(resourceId: string, properties: SubnetSchema['properties'], parents: [SubnetVpc]) {
    super(resourceId, properties, parents);
  }
}
