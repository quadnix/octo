import { AModule, type Account, type App, Module, ModuleError } from '@quadnix/octo';
import { AwsEcrImageAnchor } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsEcrImageModuleSchema } from './index.schema.js';
import { AwsEcrImage } from './models/image/index.js';

/**
 * `AwsEcrImageModule` is an ECR-based AWS image module that provides an implementation for the `Image` model.
 * This module creates AWS ECR (Elastic Container Registry) repositories for storing and managing container images.
 * It creates the repositories and nothing else - the versions inside them are published by the
 * `AwsEcrImageTagModule`, one module per version.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Region, stub } from '@quadnix/octo';
 * import { AwsEcrImageModule } from '@quadnix/octo-aws-cdk/modules/image/aws-ecr-image';
 *
 * octo.loadModule(AwsEcrImageModule, 'my-image-module', {
 *   imageFamily: 'quadnix',
 *   imageName: 'nginx',
 *   regions: [
 *     stub<Region>('${{my-region-1-module.model.region}}'),
 *     stub<Region>('${{my-region-2-module.model.region}}'),
 *   ],
 * });
 * ```
 *
 * @group Modules/Image/AwsEcrImage
 *
 * @reference Resources {@link EcrImageSchema}
 *
 * @see {@link AwsEcrImageModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Image](/api/octo/class/Image) to learn more about the `Image` model.
 */
@Module<AwsEcrImageModule>('@octo', AwsEcrImageModuleSchema)
export class AwsEcrImageModule extends AModule<AwsEcrImageModuleSchema, AwsEcrImage> {
  /**
   * Creates the image, and registers one ECR repository per account and region it is used in.
   */
  async onInit(inputs: AwsEcrImageModuleSchema): Promise<AwsEcrImage> {
    const { app } = await this.registerMetadata(inputs);

    // Create a new image.
    const image = new AwsEcrImage(inputs.imageFamily, inputs.imageName);
    app.addImage(image);

    // Advertise the repositories, so a module publishing a version into them can find this image.
    image.addAnchor(new AwsEcrImageAnchor('AwsEcrImageAnchor', { imageId: image.imageId }, image));

    return image;
  }

  /**
   * Resolves the app, and the distinct account/region pairs an ECR repository is needed in.
   */
  override async registerMetadata(
    inputs: AwsEcrImageModuleSchema,
  ): Promise<{ app: App; uniqueImageRepositories: { awsAccountId: string; awsRegionId: string }[] }> {
    const metadata: Awaited<ReturnType<AwsEcrImageModule['registerMetadata']>> = {
      app: undefined as unknown as App,
      uniqueImageRepositories: [],
    };

    for (const region of inputs.regions) {
      const account = region.getParents()['account'][0].to as Account;
      if (!metadata.app) {
        metadata.app = account.getParents()['app'][0].to as App;
      }

      // Get AWS Region ID, of a region with a network or of a serverless one.
      const [matchingAnchor] = [
        ...(await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], { searchBoundaryMembers: false })),
        ...(await region.getAnchorsMatchingSchema(AwsServerlessRegionAnchorSchema, [], {
          searchBoundaryMembers: false,
        })),
      ];
      if (!matchingAnchor) {
        throw new ModuleError(`Region "${region.regionId}" is not an AWS region!`, this.constructor.name);
      }
      const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

      // A repository is named by its image and region alone, so one region holds it for one account.
      const sharedRegion = metadata.uniqueImageRepositories.find(
        (r) => r.awsAccountId !== account.accountId && r.awsRegionId === awsRegionId,
      );
      if (sharedRegion) {
        throw new ModuleError(
          `Image cannot be held in "${awsRegionId}" by more than one account!`,
          this.constructor.name,
        );
      }

      if (
        !metadata.uniqueImageRepositories.find(
          (r) => r.awsAccountId === account.accountId && r.awsRegionId === awsRegionId,
        )
      ) {
        metadata.uniqueImageRepositories.push({
          awsAccountId: account.accountId,
          awsRegionId,
        });
      }
    }

    return metadata;
  }
}
