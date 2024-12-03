import { AResource, Resource } from '@quadnix/octo';
import { RouteTableInternetGateway, RouteTableSchema, RouteTableSubnet, RouteTableVpc } from './route-table.schema.js';

@Resource<RouteTable>('@octo', 'route-table', RouteTableSchema)
export class RouteTable extends AResource<RouteTableSchema, RouteTable> {
  declare properties: RouteTableSchema['properties'];
  declare response: RouteTableSchema['response'];

  constructor(
    resourceId: string,
    properties: RouteTableSchema['properties'],
    parents: [RouteTableVpc, RouteTableInternetGateway, RouteTableSubnet],
  ) {
    super(resourceId, properties, parents);
  }
}
