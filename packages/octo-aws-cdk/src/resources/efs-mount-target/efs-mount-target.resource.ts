import { AResource, Resource, getSchemaInstance } from '@quadnix/octo';
import assert from 'node:assert';
import {
  type EfsMountTargetEfs,
  EfsMountTargetEfsSchema,
  EfsMountTargetSchema,
  type EfsMountTargetSubnet,
  EfsMountTargetSubnetSchema,
} from './efs-mount-target.schema.js';

@Resource<EfsMountTarget>('@octo', 'efs-mount-target', EfsMountTargetSchema)
export class EfsMountTarget extends AResource<EfsMountTargetSchema, EfsMountTarget> {
  declare properties: EfsMountTargetSchema['properties'];
  declare response: EfsMountTargetSchema['response'];

  constructor(
    resourceId: string,
    properties: EfsMountTargetSchema['properties'],
    parents: [EfsMountTargetEfs, EfsMountTargetSubnet],
  ) {
    assert.strictEqual((parents[0].constructor as typeof AResource).NODE_NAME, 'efs');
    getSchemaInstance(EfsMountTargetEfsSchema, parents[0].synth() as unknown as Record<string, unknown>);
    assert.strictEqual((parents[1].constructor as typeof AResource).NODE_NAME, 'subnet');
    getSchemaInstance(EfsMountTargetSubnetSchema, parents[1].synth() as unknown as Record<string, unknown>);

    super(resourceId, properties, parents);
  }

  static override async unSynth(
    _deserializationClass: any,
    resource: EfsMountTargetSchema,
    parentContexts: string[],
    deReferenceResource: (context: string) => Promise<any>,
  ): Promise<EfsMountTarget> {
    const parents = await Promise.all(parentContexts.map((p) => deReferenceResource(p)));
    const efs = parents.find((p) => p.constructor.NODE_NAME === 'efs');
    const subnet = parents.find((p) => p.constructor.NODE_NAME === 'subnet');

    const newResource = new EfsMountTarget(resource.resourceId, resource.properties, [efs, subnet]);
    for (const key of Object.keys(resource.response)) {
      newResource.response[key] = resource.response[key];
    }
    return newResource;
  }
}
