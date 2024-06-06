import { AResource, type IResource, Resource } from '@quadnix/octo';
import type { Vpc } from '../vpc/vpc.resource.js';
import type { IInternetGatewayProperties } from './internet-gateway.interface.js';

@Resource()
export class InternetGateway extends AResource<InternetGateway> {
  readonly MODEL_NAME: string = 'internet-gateway';

  constructor(resourceId: string, properties: IInternetGatewayProperties, parents: [Vpc]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
