import { AModule, type Account, Module, ModuleError } from '@quadnix/octo';
import { AwsEcrImageAnchorSchema } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import { AwsEcrImageTagModuleSchema } from './index.schema.js';
import { AwsEcrImageTagOverlay } from './overlays/aws-ecr-image-tag/index.js';

/**
 * `AwsEcrImageTagModule` is an ECR-based AWS module that publishes one version of a container image.
 * It builds the image from a Dockerfile and pushes it into the repositories of the image it points
 * at - terraform has no resource that puts an image into a registry, so octo drives the build and
 * the push itself.
 *
 * A repository holds many versions, so it is pointed at by many of these modules, one per version.
 * Adding a module publishes a version alongside the ones already there; removing a module deletes
 * that version and leaves the rest untouched. A published version is never edited: a tag is
 * immutable, so republishing one deletes it first.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Image, stub } from '@quadnix/octo';
 * import { AwsEcrImageTagModule } from '@quadnix/octo-aws-cdk/modules/image/aws-ecr-image-tag';
 *
 * octo.loadModule(AwsEcrImageTagModule, 'my-image-tag-module', {
 *   architecture: 'arm64',
 *   dockerfileDirectory: 'images/nginx',
 *   dockerfileName: 'Dockerfile',
 *   image: stub<Image>('${{my-image-module.model.image}}'),
 *   imageTag: '0.0.1'
 * });
 * ```
 *
 * @group Modules/Image/AwsEcrImageTag
 *
 * @reference Resources {@link EcrImageTagSchema}
 *
 * @see {@link AwsEcrImageTagModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 */
@Module<AwsEcrImageTagModule>('@octo', AwsEcrImageTagModuleSchema)
export class AwsEcrImageTagModule extends AModule<AwsEcrImageTagModuleSchema, AwsEcrImageTagOverlay> {
  /**
   * Creates the overlay holding this version, joined to the image whose repositories it is
   * published into.
   */
  async onInit(inputs: AwsEcrImageTagModuleSchema): Promise<AwsEcrImageTagOverlay> {
    const image = inputs.image;

    // Get the ECR image this version is published into.
    const [matchingAwsEcrImageAnchor] = await image.getAnchorsMatchingSchema(AwsEcrImageAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    if (!matchingAwsEcrImageAnchor) {
      throw new ModuleError(`Image "${image.imageId}" is not held in ECR!`, this.constructor.name);
    }

    // Publish a new version of the image. The tag is part of the overlay's id, so another tag is
    // another overlay, and editing this one is the old version leaving and the new one arriving.
    // The id takes no dots, which an image tag routinely has: octo addresses an overlay by a key it
    // splits on dots, and an id carrying one is cut short of itself. An overlay id is unique across
    // the app, and an image only within its account, so the id names the account too.
    const imageTagId = inputs.imageTag.replace(/[^\w-]/g, '-');
    const account = image.getParents()['account'][0].to as Account;

    return new AwsEcrImageTagOverlay(
      `aws-ecr-image-tag-overlay-${account.accountId}-${image.imageId}-${imageTagId}`,
      {
        architecture: inputs.architecture,
        dockerfileDirectory: inputs.dockerfileDirectory,
        dockerfileName: inputs.dockerfileName!,
        imageId: image.imageId,
        imageTag: inputs.imageTag,
      },
      [matchingAwsEcrImageAnchor],
    );
  }
}
