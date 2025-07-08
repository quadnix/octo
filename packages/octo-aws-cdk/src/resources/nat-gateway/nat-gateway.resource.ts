import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import type { InternetGatewaySchema } from '../internet-gateway/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import type { VpcSchema } from '../vpc/index.schema.js';
import { NatGatewaySchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<NatGateway>('@octo', 'nat-gateway', NatGatewaySchema)
export class NatGateway extends AResource<NatGatewaySchema, NatGateway> {
  declare parents: [
    MatchingResource<VpcSchema>,
    MatchingResource<InternetGatewaySchema>,
    MatchingResource<SubnetSchema>,
  ];
  declare properties: NatGatewaySchema['properties'];
  declare response: NatGatewaySchema['response'];

  constructor(
    resourceId: string,
    properties: NatGatewaySchema['properties'],
    parents: [MatchingResource<VpcSchema>, MatchingResource<InternetGatewaySchema>, MatchingResource<SubnetSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
