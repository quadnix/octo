import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import type { SubnetSchema } from '../subnet/subnet.schema.js';
import type { VpcSchema } from '../vpc/vpc.schema.js';
import { NetworkAclSchema } from './network-acl.schema.js';

@Resource<NetworkAcl>('@octo', 'network-acl', NetworkAclSchema)
export class NetworkAcl extends AResource<NetworkAclSchema, NetworkAcl> {
  declare parents: [MatchingResource<VpcSchema>, MatchingResource<SubnetSchema>];
  declare properties: NetworkAclSchema['properties'];
  declare response: NetworkAclSchema['response'];

  constructor(
    resourceId: string,
    properties: NetworkAclSchema['properties'],
    parents: [MatchingResource<VpcSchema>, MatchingResource<SubnetSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
