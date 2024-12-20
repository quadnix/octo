import { AResource, Resource, getSchemaInstance } from '@quadnix/octo';
import assert from 'node:assert';
import {
  NetworkAclSchema,
  NetworkAclSubnet,
  NetworkAclSubnetSchema,
  NetworkAclVpc,
  NetworkAclVpcSchema,
} from './network-acl.schema.js';

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
    getSchemaInstance(NetworkAclVpcSchema, parents[0].synth() as unknown as Record<string, unknown>);
    assert.strictEqual((parents[1].constructor as typeof AResource).NODE_NAME, 'subnet');
    getSchemaInstance(NetworkAclSubnetSchema, parents[1].synth() as unknown as Record<string, unknown>);

    super(resourceId, properties, parents);
  }

  static override async unSynth(
    _deserializationClass: any,
    resource: NetworkAclSchema,
    parentContexts: string[],
    deReferenceResource: (context: string) => Promise<any>,
  ): Promise<NetworkAcl> {
    const parents = await Promise.all(parentContexts.map((p) => deReferenceResource(p)));
    const vpc = parents.find((p) => p.constructor.NODE_NAME === 'vpc');
    const subnet = parents.find((p) => p.constructor.NODE_NAME === 'subnet');

    const newResource = new NetworkAcl(resource.resourceId, resource.properties, [vpc, subnet]);
    for (const key of Object.keys(resource.response)) {
      newResource.response[key] = resource.response[key];
    }
    return newResource;
  }
}
