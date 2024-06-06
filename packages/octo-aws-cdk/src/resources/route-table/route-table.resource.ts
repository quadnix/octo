import { AResource, type IResource, Resource } from '@quadnix/octo';
import type { InternetGateway } from '../internet-gateway/internet-gateway.resource.js';
import type { Subnet } from '../subnet/subnet.resource.js';
import type { Vpc } from '../vpc/vpc.resource.js';
import type { IRouteTableProperties } from './route-table.interface.js';

@Resource()
export class RouteTable extends AResource<RouteTable> {
  readonly MODEL_NAME: string = 'route-table';

  constructor(resourceId: string, properties: IRouteTableProperties, parents: [Vpc, InternetGateway, Subnet]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
