import { AResource, Resource } from '@quadnix/octo';
import type { Vpc } from '../vpc/vpc.resource.js';
import type { IInternetGatewayProperties, IInternetGatewayResponse } from './internet-gateway.interface.js';

@Resource()
export class InternetGateway extends AResource<InternetGateway> {
  readonly MODEL_NAME: string = 'internet-gateway';

  declare properties: IInternetGatewayProperties;
  declare response: IInternetGatewayResponse;

  constructor(resourceId: string, properties: IInternetGatewayProperties, parents: [Vpc]) {
    super(resourceId, properties, parents);
  }
}
