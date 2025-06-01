import { AResource, MatchingResource, Resource } from '@quadnix/octo';
import type { VpcSchema } from '../vpc/index.schema.js';
import { SubnetSchema } from './index.schema.js';

@Resource<Subnet>('@octo', 'subnet', SubnetSchema)
export class Subnet extends AResource<SubnetSchema, Subnet> {
  declare parents: [MatchingResource<VpcSchema>];
  declare properties: SubnetSchema['properties'];
  declare response: SubnetSchema['response'];

  constructor(resourceId: string, properties: SubnetSchema['properties'], parents: [MatchingResource<VpcSchema>]) {
    super(resourceId, properties, parents);
  }
}
