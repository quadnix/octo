import { AResource, Diff, DiffAction, DiffUtility, type MatchingResource, Resource } from '@quadnix/octo';
import { CloudFrontInvalidationSchema, type InvalidationDistributionSchema } from './index.schema.js';

/**
 * One invalidation issued against a distribution.
 *
 * This is an external resource: its lifecycle runs outside terraform, in the actions under
 * `./actions`. Terraform has no managed resource for an invalidation, because there is nothing to
 * manage - the call runs, the edges drop what they were holding, and nothing remains to be edited or
 * destroyed later.
 *
 * That is also why it never updates. Octo re-runs it whenever its properties move, which terraform
 * sees as replacing the shell around it: the delete half has nothing to undo, and the add half
 * issues a fresh invalidation.
 *
 * @internal
 */
@Resource<CloudFrontInvalidation>('@octo', 'cloudfront-invalidation', CloudFrontInvalidationSchema)
export class CloudFrontInvalidation extends AResource<CloudFrontInvalidationSchema, CloudFrontInvalidation> {
  declare parents: [MatchingResource<InvalidationDistributionSchema>];
  declare properties: CloudFrontInvalidationSchema['properties'];
  declare response: CloudFrontInvalidationSchema['response'];

  /**
   * @internal
   */
  constructor(
    resourceId: string,
    properties: CloudFrontInvalidationSchema['properties'],
    parents: [MatchingResource<InvalidationDistributionSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  /**
   * Applying this resource's own diff means taking on the whole of what was invalidated - the
   * version and the paths together. There is no smaller unit: the base implementation walks
   * properties one key at a time, and this resource only ever reports the one diff.
   *
   * @internal
   */
  override async diffInverse(
    diff: Diff<CloudFrontInvalidation>,
    deReferenceResource: (resourceId: string) => Promise<never>,
  ): Promise<void> {
    if (diff.action === DiffAction.UPDATE && diff.field === 'update-content-version') {
      await this.cloneResourceInPlace(diff.node, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  /**
   * A change of any kind means the edges are holding something stale, and the answer is always the
   * same: issue an invalidation. So there is one diff here rather than one per property.
   *
   * It reports an update rather than a replacement even though nothing about the previous
   * invalidation is edited, because a replacement would have to destroy something first and there is
   * nothing to destroy - an invalidation that ran is over. What persists between runs is octo's
   * record of which content version the edges were last told about, and that is what an update moves.
   *
   * Every property counts, which is what keeps this in step with the trigger hash terraform holds:
   * that hash defaults to every property too, and a property this ignored would have terraform
   * re-run an invalidation octo reported no change for.
   *
   * @internal
   */
  override async diffProperties(previous: CloudFrontInvalidation): Promise<Diff[]> {
    return DiffUtility.isObjectDeepEquals(previous.properties, this.properties)
      ? []
      : [new Diff(this, DiffAction.UPDATE, 'update-content-version', this.properties.contentVersion)];
  }

  /**
   * Two diffs survive: this resource arriving or leaving, and the content version moving. Everything
   * else a resource can diff describes something an invalidation does not own.
   *
   * A changed parent is the one worth naming. If the distribution is merely reconfigured, its ARN
   * and id do not move, terraform's triggers do not move, and terraform re-runs nothing - so octo
   * acting here would invalidate on a change terraform considers no change at all. If the
   * distribution is instead replaced, its outputs do move, and terraform calls back on its own.
   * Either way the parent diff is not this resource's to answer.
   *
   * @internal
   */
  override diffUnpack(diff: Diff): Diff[] {
    return diff.field === 'resourceId' || diff.field === 'update-content-version' ? [diff] : [];
  }
}
