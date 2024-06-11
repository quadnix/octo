import { AResource, Resource } from '@quadnix/octo';
import type { InternetGateway } from '../internet-gateway/internet-gateway.resource.js';
import type { Subnet } from '../subnet/subnet.resource.js';
import type { Vpc } from '../vpc/vpc.resource.js';
import type { IRouteTableProperties, IRouteTableResponse } from './route-table.interface.js';

@Resource()
export class RouteTable extends AResource<RouteTable> {
  readonly MODEL_NAME: string = 'route-table';

  declare properties: IRouteTableProperties;
  declare response: IRouteTableResponse;

  constructor(resourceId: string, properties: IRouteTableProperties, parents: [Vpc, InternetGateway, Subnet]) {
    super(resourceId, properties, parents);
  }
}
