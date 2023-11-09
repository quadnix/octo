import { AResource, Resource } from '@quadnix/octo';
import { Vpc } from '../vpc/vpc.resource.js';
import { IInternetGatewayProperties } from './internet-gateway.interface.js';

@Resource()
export class InternetGateway extends AResource<InternetGateway> {
  readonly MODEL_NAME: string = 'internet-gateway';

  constructor(resourceId: string, properties: IInternetGatewayProperties, parents: [Vpc]) {
    super(resourceId, {}, parents);
  }
}
