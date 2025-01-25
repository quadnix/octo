import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import { InternetGatewaySchema, type InternetGatewayVpcSchema } from './internet-gateway.schema.js';

@Resource<InternetGateway>('@octo', 'internet-gateway', InternetGatewaySchema)
export class InternetGateway extends AResource<InternetGatewaySchema, InternetGateway> {
  declare parents: [MatchingResource<InternetGatewayVpcSchema>];
  declare properties: InternetGatewaySchema['properties'];
  declare response: InternetGatewaySchema['response'];

  constructor(
    resourceId: string,
    properties: InternetGatewaySchema['properties'],
    parents: [MatchingResource<InternetGatewayVpcSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
