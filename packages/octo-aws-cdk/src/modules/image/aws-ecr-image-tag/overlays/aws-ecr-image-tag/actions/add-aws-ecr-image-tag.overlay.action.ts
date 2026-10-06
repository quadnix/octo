import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  OverlayActionExceptionTransactionError,
  hasNodeName,
} from '@quadnix/octo';
import { EcrImageSchema } from '../../../../../../resources/ecr/index.schema.js';
import { EcrImageTag } from '../../../../../../resources/ecr-image-tag/index.js';
import type { AwsEcrImageTagModule } from '../../../aws-ecr-image-tag.module.js';
import { AwsEcrImageTagOverlay } from '../aws-ecr-image-tag.overlay.js';

/**
 * @internal
 */
@Action(AwsEcrImageTagOverlay)
export class AddAwsEcrImageTagOverlayAction implements IModelAction<AwsEcrImageTagModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcrImageTagOverlay &&
      hasNodeName(diff.node, 'aws-ecr-image-tag-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsEcrImageTagOverlay>,
    _actionInputs: EnhancedModuleSchema<AwsEcrImageTagModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    // Get properties.
    const awsEcrImageTagOverlay = diff.node;
    const properties = awsEcrImageTagOverlay.properties;

    // Publish this version into every repository the image owns, i.e. into each of its regions.
    const matchingEcrImages = await awsEcrImageTagOverlay.getResourcesMatchingSchema(EcrImageSchema, [
      { key: 'imageId', value: properties.imageId },
    ]);
    if (matchingEcrImages.length === 0) {
      throw new OverlayActionExceptionTransactionError(
        `ECR repository for image "${properties.imageId}" not found!`,
        diff,
        this.constructor.name,
      );
    }

    for (const matchingEcrImage of matchingEcrImages) {
      const { awsAccountId, awsRegionId, imageId } = matchingEcrImage.getSchemaInstance().properties;

      // A resource id takes no dots, which an image tag routinely has.
      const resourceId = `ecr-image-tag-${awsRegionId}-${imageId}-${properties.imageTag.replace(/[^\w-]/g, '-')}`;
      const ecrImageTag = new EcrImageTag(
        resourceId,
        {
          architecture: properties.architecture,
          awsAccountId,
          awsRegionId,
          buildArguments: properties.buildArguments,
          buildSecrets: properties.buildSecrets,
          dockerfileDirectory: properties.dockerfileDirectory,
          dockerfileName: properties.dockerfileName,
          imageId,
          imageTag: properties.imageTag,
        },
        [matchingEcrImage],
      );

      actionOutputs[ecrImageTag.resourceId] = ecrImageTag;
    }

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEcrImageTagOverlayAction>(AddAwsEcrImageTagOverlayAction)
export class AddAwsEcrImageTagOverlayActionFactory {
  private static instance: AddAwsEcrImageTagOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsEcrImageTagOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcrImageTagOverlayAction();
    }
    return this.instance;
  }
}
