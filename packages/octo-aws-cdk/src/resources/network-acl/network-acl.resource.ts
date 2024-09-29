import { AResource, Resource } from '@quadnix/octo';
import type { Subnet } from '../subnet/index.js';
import type { Vpc } from '../vpc/index.js';
import type { INetworkAclProperties, INetworkAclResponse } from './network-acl.interface.js';

@Resource('@octo', 'network-acl')
export class NetworkAcl extends AResource<NetworkAcl> {
  declare properties: INetworkAclProperties;
  declare response: INetworkAclResponse;

  constructor(resourceId: string, properties: INetworkAclProperties, parents: [Vpc, Subnet]) {
    super(resourceId, properties, parents);
  }
}
