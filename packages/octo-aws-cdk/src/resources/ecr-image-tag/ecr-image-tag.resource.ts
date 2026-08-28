import { AResource, Diff, DiffAction, DiffUtility, type MatchingResource, Resource } from '@quadnix/octo';
import type { EcrImageSchema } from '../ecr/index.schema.js';
import { EcrImageTagSchema } from './index.schema.js';

/**
 * One container image published into an ECR repository.
 *
 * This is an external resource: its lifecycle runs outside terraform, in the actions under
 * `./actions`. Terraform has no managed resource that puts an image into a registry, so octo builds
 * the image with the local docker CLI and pushes it through the ECR API itself, and terraform
 * shells back into `octo run-action` to do it.
 *
 * A published image only ever arrives and departs. It is never edited: the registry holds whatever
 * was pushed, and the repository's tags are immutable, so a change to what is published under a tag
 * is a delete followed by an add.
 *
 * @internal
 */
@Resource<EcrImageTag>('@octo', 'ecr-image-tag', EcrImageTagSchema)
export class EcrImageTag extends AResource<EcrImageTagSchema, EcrImageTag> {
  declare parents: [MatchingResource<EcrImageSchema>];
  declare properties: EcrImageTagSchema['properties'];
  declare response: EcrImageTagSchema['response'];

  /**
   * @internal
   */
  constructor(
    resourceId: string,
    properties: EcrImageTagSchema['properties'],
    parents: [MatchingResource<EcrImageSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  /**
   * A replacement leaves the image exactly as this resource describes it, so the applied graph
   * takes the whole resource. The base class knows only how to remove one.
   *
   * @internal
   */
  override async diffInverse(
    diff: Diff<EcrImageTag>,
    deReferenceResource: (resourceId: string) => Promise<never>,
  ): Promise<void> {
    if (diff.action === DiffAction.REPLACE && diff.field === 'resourceId') {
      await this.cloneResourceInPlace(diff.node, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  /**
   * The tag is part of the resource id, so publishing another one is another resource. That leaves
   * a change to what this tag is built from, which cannot be applied in place - the image already
   * in the registry has to go before the same tag can be written again.
   *
   * Terraform reaches the same conclusion on its own: an external resource's properties are hashed
   * into the trigger of the `null_resource` standing in for it, so a changed property recreates it.
   * Reporting `REPLACE` here is what keeps octo's diff saying the same thing terraform plans.
   *
   * @internal
   */
  override async diffProperties(previous: EcrImageTag): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'a published image is immutable; republishing the tag deletes it first',
        ),
      ];
    }

    return [];
  }

  /**
   * Only whole-image diffs survive: publish it, delete it, or replace it. Everything else a
   * resource can diff describes something this image does not own.
   *
   * ECR tags a repository rather than the images inside it, so a tag scope covering this resource
   * belongs to its parent, which carries and reports it. The parent itself needs no diff either -
   * the repository an image was published into is part of its properties, so a repository that
   * changed, or a move to a different one, already shows up as a replacement above, or as an
   * entirely different resource when the repository name is part of the resource id.
   *
   * @internal
   */
  override diffUnpack(diff: Diff): Diff[] {
    return diff.field === 'resourceId' ? [diff] : [];
  }
}
