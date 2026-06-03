import { AModule, type Account, type App, Module } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsEcrImageModuleSchema } from './index.schema.js';
import { AwsEcrImage } from './models/image/index.js';

/**
 * `AwsEcrImageModule` is an ECR-based AWS image module that provides an implementation for the `Image` model.
 * This module creates AWS ECR (Elastic Container Registry) repositories for storing and managing container images.
 * It provides functionality to manage Docker images across multiple AWS regions
 * and generate ECR authentication commands.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsEcrImageModule } from '@quadnix/octo-aws-cdk/modules/image/aws-ecr-image';
 *
 * octo.loadModule(AwsEcrImageModule, 'my-image-module', {
 *   imageFamily: 'quadnix',
 *   imageName: 'nginx',
 *   regions: [myRegion1, myRegion2]
 * });
 * ```
 *
 * @group Modules/Image/AwsEcrImage
 *
 * @reference Resources {@link EcrImageSchema}
 *
 * @see {@link AwsEcrImageModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Image} to learn more about the `Image` model.
 */
@Module<AwsEcrImageModule>('@octo', AwsEcrImageModuleSchema)
export class AwsEcrImageModule extends AModule<AwsEcrImageModuleSchema, AwsEcrImage> {
  async onInit(inputs: AwsEcrImageModuleSchema): Promise<AwsEcrImage> {
    const { app } = await this.registerMetadata(inputs);

    // Create a new image.
    const image = new AwsEcrImage(inputs.imageFamily, inputs.imageName);
    app.addImage(image);

    return image;
  }

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

      // Get AWS Region ID.
      const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

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
