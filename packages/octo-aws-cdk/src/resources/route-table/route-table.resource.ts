import { AResource, Resource } from '@quadnix/octo';
import type { InternetGateway } from '../internet-gateway/index.js';
import type { Subnet } from '../subnet/index.js';
import type { Vpc } from '../vpc/index.js';
import { RouteTableSchema } from './route-table.schema.js';

@Resource<RouteTable>('@octo', 'route-table', RouteTableSchema)
export class RouteTable extends AResource<RouteTableSchema, RouteTable> {
  declare properties: RouteTableSchema['properties'];
  declare response: RouteTableSchema['response'];

  constructor(resourceId: string, properties: RouteTableSchema['properties'], parents: [Vpc, InternetGateway, Subnet]) {
    super(resourceId, properties, parents);
  }
}
