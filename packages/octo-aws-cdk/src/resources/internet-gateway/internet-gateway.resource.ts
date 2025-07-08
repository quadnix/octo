import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import type { VpcSchema } from '../vpc/index.schema.js';
import { InternetGatewaySchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<InternetGateway>('@octo', 'internet-gateway', InternetGatewaySchema)
export class InternetGateway extends AResource<InternetGatewaySchema, InternetGateway> {
  declare parents: [MatchingResource<VpcSchema>];
  declare properties: InternetGatewaySchema['properties'];
  declare response: InternetGatewaySchema['response'];

  constructor(
    resourceId: string,
    properties: InternetGatewaySchema['properties'],
    parents: [MatchingResource<VpcSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
