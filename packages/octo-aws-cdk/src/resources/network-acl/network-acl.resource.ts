import { IResource, Resource } from '@quadnix/octo';
import { Subnet } from '../subnet/subnet.resource';
import { Vpc } from '../vpc/vpc.resource';
import { INetworkAclProperties } from './network-acl.interface';

export class NetworkAcl extends Resource<NetworkAcl> {
  readonly MODEL_NAME: string = 'network-acl';

  constructor(resourceId: string, properties: INetworkAclProperties, parents: [Vpc, Subnet]) {
    properties.entries = JSON.stringify(properties.entries) as any;

    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
