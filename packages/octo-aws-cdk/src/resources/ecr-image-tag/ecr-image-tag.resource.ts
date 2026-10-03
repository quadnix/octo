import { AResource, type Diff, type MatchingResource, Resource } from '@quadnix/octo';
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
 * was pushed, and the repository's tags are immutable, so publishing something else means
 * publishing another tag - which, the tag being part of the resource id, is another resource.
 *
 * @internal
 */
@Resource<EcrImageTag>('@octo', 'ecr-image-tag', EcrImageTagSchema, {
  uniqueProperties: [{ path: 'imageTag', within: ['awsAccountId', 'awsRegionId', 'imageId'] }],
})
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
   * A published image is never diffed against itself. Its identity - account, region, repository and
   * tag - is the resource id, so two resources sharing an id are the same image, and the tag it sits
   * under is immutable. What remains are the build inputs, which say how the image was made rather
   * than what it is: octo does not read the Dockerfile's contents either, and a path to it that
   * moved is the weaker signal of the two. Publishing something else means publishing another tag.
   *
   * @internal
   */
  override async diffProperties(_previous: EcrImageTag): Promise<Diff[]> {
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

  /**
   * Nothing about this resource asks terraform to call back a second time, because nothing about it
   * can change. It arrives, and it departs.
   *
   * @internal
   */
  override getExternalTriggerProperties(): Partial<EcrImageTagSchema['properties']> {
    return {};
  }
}
