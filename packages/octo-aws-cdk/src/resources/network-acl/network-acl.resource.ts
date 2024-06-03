import { AResource, Resource } from '@quadnix/octo';
import type { IResource } from '@quadnix/octo';
import type { Subnet } from '../subnet/subnet.resource.js';
import type { Vpc } from '../vpc/vpc.resource.js';
import type { INetworkAclProperties } from './network-acl.interface.js';

@Resource()
export class NetworkAcl extends AResource<NetworkAcl> {
  readonly MODEL_NAME: string = 'network-acl';

  constructor(resourceId: string, properties: INetworkAclProperties, parents: [Vpc, Subnet]) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
