import { AResource, Resource } from '@quadnix/octo';
import type { Vpc } from '../vpc/index.js';
import { InternetGatewaySchema } from './internet-gateway.schema.js';

@Resource<InternetGateway>('@octo', 'internet-gateway', InternetGatewaySchema)
export class InternetGateway extends AResource<InternetGatewaySchema, InternetGateway> {
  declare properties: InternetGatewaySchema['properties'];
  declare response: InternetGatewaySchema['response'];

  constructor(resourceId: string, properties: InternetGatewaySchema['properties'], parents: [Vpc]) {
    super(resourceId, properties, parents);
  }
}
