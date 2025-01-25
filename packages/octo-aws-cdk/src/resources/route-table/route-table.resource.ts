import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import {
  type RouteTableInternetGatewaySchema,
  RouteTableSchema,
  type RouteTableSubnetSchema,
  type RouteTableVpcSchema,
} from './route-table.schema.js';

@Resource<RouteTable>('@octo', 'route-table', RouteTableSchema)
export class RouteTable extends AResource<RouteTableSchema, RouteTable> {
  declare parents: [
    MatchingResource<RouteTableVpcSchema>,
    MatchingResource<RouteTableInternetGatewaySchema>,
    MatchingResource<RouteTableSubnetSchema>,
  ];
  declare properties: RouteTableSchema['properties'];
  declare response: RouteTableSchema['response'];

  constructor(
    resourceId: string,
    properties: RouteTableSchema['properties'],
    parents: [
      MatchingResource<RouteTableVpcSchema>,
      MatchingResource<RouteTableInternetGatewaySchema>,
      MatchingResource<RouteTableSubnetSchema>,
    ],
  ) {
    super(resourceId, properties, parents);
  }
}
