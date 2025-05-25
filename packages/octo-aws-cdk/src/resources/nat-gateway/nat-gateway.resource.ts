import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import type { VpcSchema } from '../vpc/vpc.schema.js';
import type { SubnetSchema } from '../subnet/subnet.schema.js';
import { NatGatewaySchema } from './nat-gateway.schema.js';

@Resource<NatGateway>('@octo', 'nat-gateway', NatGatewaySchema)
export class NatGateway extends AResource<NatGatewaySchema, NatGateway> {
  declare parents: [MatchingResource<VpcSchema>, MatchingResource<SubnetSchema>];
  declare properties: NatGatewaySchema['properties'];
  declare response: NatGatewaySchema['response'];

  constructor(
    resourceId: string,
    properties: NatGatewaySchema['properties'],
    parents: [MatchingResource<VpcSchema>, MatchingResource<SubnetSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
