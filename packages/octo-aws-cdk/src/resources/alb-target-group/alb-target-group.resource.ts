import { AResource, Diff, DiffAction, DiffUtility, type MatchingResource, Resource } from '@quadnix/octo';
import type { VpcSchema } from '../vpc/index.schema.js';
import { AlbTargetGroupSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<AlbTargetGroup>('@octo', 'alb-target-group', AlbTargetGroupSchema)
export class AlbTargetGroup extends AResource<AlbTargetGroupSchema, AlbTargetGroup> {
  declare parents: [MatchingResource<VpcSchema>];
  declare properties: AlbTargetGroupSchema['properties'];
  declare response: AlbTargetGroupSchema['response'];

  constructor(
    resourceId: string,
    properties: AlbTargetGroupSchema['properties'],
    parents: [MatchingResource<VpcSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  override async diffInverse(
    diff: Diff<AlbTargetGroup>,
    deReferenceResource: (resourceId: string) => Promise<AResource<VpcSchema, any>>,
  ): Promise<void> {
    if (diff.field === 'properties' && diff.action === DiffAction.UPDATE) {
      this.clonePropertiesInPlace(diff.node);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: AlbTargetGroup): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (!DiffUtility.isObjectDeepEquals(previous.properties.healthCheck, this.properties.healthCheck)) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'properties', this.properties.healthCheck));
    }

    return diffs;
  }
}
