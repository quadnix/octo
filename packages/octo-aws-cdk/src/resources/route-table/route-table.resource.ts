import { Resource } from '@quadnix/octo';
import { InternetGateway } from '../internet-gateway/internet-gateway.resource.js';
import { Subnet } from '../subnet/subnet.resource.js';
import { Vpc } from '../vpc/vpc.resource.js';
import { IRouteTableProperties } from './route-table.interface.js';

export class RouteTable extends Resource<RouteTable> {
  readonly MODEL_NAME: string = 'route-table';

  constructor(resourceId: string, properties: IRouteTableProperties, parents: [Vpc, InternetGateway, Subnet]) {
    super(resourceId, {}, parents);
  }
}
