import { Resource } from '@quadnix/octo';
import { Vpc } from '../vpc/vpc.resource.js';
import { IInternetGatewayProperties } from './internet-gateway.interface.js';

export class InternetGateway extends Resource<InternetGateway> {
  readonly MODEL_NAME: string = 'internet-gateway';

  constructor(resourceId: string, properties: IInternetGatewayProperties, parents: [Vpc]) {
    super(resourceId, {}, parents);
  }
}
