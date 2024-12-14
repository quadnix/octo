import { AResource, Resource } from '@quadnix/octo';
import assert from 'node:assert';
import { type EfsMountTargetEfs, EfsMountTargetSchema, type EfsMountTargetSubnet } from './efs-mount-target.schema.js';

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
    assert.strictEqual((parents[1].constructor as typeof AResource).NODE_NAME, 'subnet');

    super(resourceId, properties, parents);
  }
}
