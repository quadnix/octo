import { AResource, IResource, Resource } from '@quadnix/octo';
import { Subnet } from '../subnet/subnet.resource.js';
import { Vpc } from '../vpc/vpc.resource.js';
import { INetworkAclProperties } from './network-acl.interface.js';

@Resource()
export class NetworkAcl extends AResource<NetworkAcl> {
  readonly MODEL_NAME: string = 'network-acl';

  constructor(resourceId: string, properties: INetworkAclProperties, parents: [Vpc, Subnet]) {
    properties.entries = JSON.stringify(properties.entries) as any;

    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
