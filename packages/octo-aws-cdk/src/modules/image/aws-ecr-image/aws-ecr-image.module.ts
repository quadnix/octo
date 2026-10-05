import { AModule, type Account, Module, ModuleError } from '@quadnix/octo';
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
   * Creates the image in the account of its regions, and registers one ECR repository per AWS region
   * it is used in.
   */
  async onInit(inputs: AwsEcrImageModuleSchema): Promise<AwsEcrImage> {
    const { account } = await this.registerMetadata(inputs);

    // Create a new image.
    const image = new AwsEcrImage(inputs.imageFamily, inputs.imageName);
    account.addImage(image);

    // Link the image to each region it is published into. A link is not a parent, so adding or
    // removing a region leaves the image's place, and so the id of every repository and tag, as it is.
    for (const region of inputs.regions) {
      image.addRelationship(region);
    }

    // Advertise the repositories, so a module publishing a version into them can find this image.
    image.addAnchor(new AwsEcrImageAnchor('AwsEcrImageAnchor', { imageId: image.imageId }, image));

    return image;
  }

  /**
   * Resolves the account the image sits in, and the distinct AWS regions an ECR repository is needed in.
   */
  override async registerMetadata(
    inputs: AwsEcrImageModuleSchema,
  ): Promise<{ account: Account; uniqueImageRepositories: { awsAccountId: string; awsRegionId: string }[] }> {
    const metadata: Awaited<ReturnType<AwsEcrImageModule['registerMetadata']>> = {
      account: inputs.regions[0].getParents()['account'][0].to as Account,
      uniqueImageRepositories: [],
    };

    for (const region of inputs.regions) {
      // An image is used only inside its own account, so every region must sit in that account.
      const account = region.getParents()['account'][0].to as Account;
      if (account.accountId !== metadata.account.accountId) {
        throw new ModuleError(
          `Region "${region.regionId}" is in account "${account.accountId}", but the image is in account "${metadata.account.accountId}"!`,
          this.constructor.name,
        );
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
