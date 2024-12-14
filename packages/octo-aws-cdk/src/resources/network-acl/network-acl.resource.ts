import { AResource, Resource } from '@quadnix/octo';
import assert from 'node:assert';
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
    assert.strictEqual((parents[0].constructor as typeof AResource).NODE_NAME, 'vpc');
    assert.strictEqual((parents[1].constructor as typeof AResource).NODE_NAME, 'subnet');

    super(resourceId, properties, parents);
  }
}
