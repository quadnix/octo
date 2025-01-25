import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import { NetworkAclSchema, type NetworkAclSubnetSchema, type NetworkAclVpcSchema } from './network-acl.schema.js';

@Resource<NetworkAcl>('@octo', 'network-acl', NetworkAclSchema)
export class NetworkAcl extends AResource<NetworkAclSchema, NetworkAcl> {
  declare parents: [MatchingResource<NetworkAclVpcSchema>, MatchingResource<NetworkAclSubnetSchema>];
  declare properties: NetworkAclSchema['properties'];
  declare response: NetworkAclSchema['response'];

  constructor(
    resourceId: string,
    properties: NetworkAclSchema['properties'],
    parents: [MatchingResource<NetworkAclVpcSchema>, MatchingResource<NetworkAclSubnetSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
