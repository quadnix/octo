import { AResource, Resource } from '@quadnix/octo';
import type { InternetGateway } from '../internet-gateway/index.js';
import type { Subnet } from '../subnet/index.js';
import type { Vpc } from '../vpc/index.js';
import type { IRouteTableProperties, IRouteTableResponse } from './route-table.interface.js';

@Resource('@octo', 'route-table')
export class RouteTable extends AResource<RouteTable> {
  declare properties: IRouteTableProperties;
  declare response: IRouteTableResponse;

  constructor(resourceId: string, properties: IRouteTableProperties, parents: [Vpc, InternetGateway, Subnet]) {
    super(resourceId, properties, parents);
  }
}
