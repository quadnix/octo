import { AResource, Resource } from '@quadnix/octo';
import { NetworkAclSchema, NetworkAclSubnet, NetworkAclVpc } from './network-acl.schema.js';

@Resource<NetworkAcl>('@octo', 'network-acl', NetworkAclSchema)
export class NetworkAcl extends AResource<NetworkAclSchema, NetworkAcl> {
  declare properties: NetworkAclSchema['properties'];
  declare response: NetworkAclSchema['response'];

  constructor(
    resourceId: string,
    properties: NetworkAclSchema['properties'],
    parents: [NetworkAclVpc, NetworkAclSubnet],
  ) {
    super(resourceId, properties, parents);
  }
}
