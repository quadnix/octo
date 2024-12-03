import { AResource, Resource } from '@quadnix/octo';
import { InternetGatewaySchema, type InternetGatewayVpc } from './internet-gateway.schema.js';

@Resource<InternetGateway>('@octo', 'internet-gateway', InternetGatewaySchema)
export class InternetGateway extends AResource<InternetGatewaySchema, InternetGateway> {
  declare properties: InternetGatewaySchema['properties'];
  declare response: InternetGatewaySchema['response'];

  constructor(resourceId: string, properties: InternetGatewaySchema['properties'], parents: [InternetGatewayVpc]) {
    super(resourceId, properties, parents);
  }
}
