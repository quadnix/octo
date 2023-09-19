import { Resource } from '@quadnix/octo';
import { InternetGateway } from '../internet-gateway/internet-gateway.resource';
import { Subnet } from '../subnet/subnet.resource';
import { Vpc } from '../vpc/vpc.resource';
import { IRouteTableProperties } from './route-table.interface';

export class RouteTable extends Resource<RouteTable> {
  readonly MODEL_NAME: string = 'route-table';

  constructor(resourceId: string, properties: IRouteTableProperties, parents: [Vpc, InternetGateway, Subnet]) {
    super(resourceId, {}, parents);
  }
}
