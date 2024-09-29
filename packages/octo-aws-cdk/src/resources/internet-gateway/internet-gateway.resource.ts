import { AResource, Resource } from '@quadnix/octo';
import type { Vpc } from '../vpc/index.js';
import type { IInternetGatewayProperties, IInternetGatewayResponse } from './internet-gateway.interface.js';

@Resource('@octo', 'internet-gateway')
export class InternetGateway extends AResource<InternetGateway> {
  declare properties: IInternetGatewayProperties;
  declare response: IInternetGatewayResponse;

  constructor(resourceId: string, properties: IInternetGatewayProperties, parents: [Vpc]) {
    super(resourceId, properties, parents);
  }
}
