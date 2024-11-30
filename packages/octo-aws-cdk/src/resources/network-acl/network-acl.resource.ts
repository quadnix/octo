import { AResource, Resource } from '@quadnix/octo';
import type { Subnet } from '../subnet/index.js';
import type { Vpc } from '../vpc/index.js';
import { NetworkAclSchema } from './network-acl.schema.js';

@Resource<NetworkAcl>('@octo', 'network-acl', NetworkAclSchema)
export class NetworkAcl extends AResource<NetworkAclSchema, NetworkAcl> {
  declare properties: NetworkAclSchema['properties'];
  declare response: NetworkAclSchema['response'];

  constructor(resourceId: string, properties: NetworkAclSchema['properties'], parents: [Vpc, Subnet]) {
    super(resourceId, properties, parents);
  }
}
