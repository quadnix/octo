import { AResource, Resource } from '@quadnix/octo';
import type { Subnet } from '../subnet/subnet.resource.js';
import type { Vpc } from '../vpc/vpc.resource.js';
import type { INetworkAclProperties, INetworkAclResponse } from './network-acl.interface.js';

@Resource()
export class NetworkAcl extends AResource<NetworkAcl> {
  readonly NODE_NAME: string = 'network-acl';

  declare properties: INetworkAclProperties;
  declare response: INetworkAclResponse;

  constructor(resourceId: string, properties: INetworkAclProperties, parents: [Vpc, Subnet]) {
    super(resourceId, properties, parents);
  }
}
