import { AResource, MatchingResource, Resource } from '@quadnix/octo';
import { SubnetSchema, type SubnetVpcSchema } from './subnet.schema.js';

@Resource<Subnet>('@octo', 'subnet', SubnetSchema)
export class Subnet extends AResource<SubnetSchema, Subnet> {
  declare parents: [MatchingResource<SubnetVpcSchema>];
  declare properties: SubnetSchema['properties'];
  declare response: SubnetSchema['response'];

  constructor(
    resourceId: string,
    properties: SubnetSchema['properties'],
    parents: [MatchingResource<SubnetVpcSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
