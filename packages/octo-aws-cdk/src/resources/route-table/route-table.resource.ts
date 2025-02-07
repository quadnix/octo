import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import type { InternetGatewaySchema } from '../internet-gateway/internet-gateway.schema.js';
import type { SubnetSchema } from '../subnet/subnet.schema.js';
import type { VpcSchema } from '../vpc/vpc.schema.js';
import { RouteTableSchema } from './route-table.schema.js';

@Resource<RouteTable>('@octo', 'route-table', RouteTableSchema)
export class RouteTable extends AResource<RouteTableSchema, RouteTable> {
  declare parents: [
    MatchingResource<VpcSchema>,
    MatchingResource<InternetGatewaySchema>,
    MatchingResource<SubnetSchema>,
  ];
  declare properties: RouteTableSchema['properties'];
  declare response: RouteTableSchema['response'];

  constructor(
    resourceId: string,
    properties: RouteTableSchema['properties'],
    parents: [MatchingResource<VpcSchema>, MatchingResource<InternetGatewaySchema>, MatchingResource<SubnetSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
