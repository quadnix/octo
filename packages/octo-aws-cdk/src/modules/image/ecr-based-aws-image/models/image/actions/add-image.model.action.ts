import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import { EcrImage } from '../../../../../../resources/ecr/index.js';
import type { AwsImageModule } from '../../../aws-image.module.js';
import { AwsImage } from '../aws.image.model.js';

/**
 * @internal
 */
@Action(AwsImage)
export class AddImageModelAction implements IModelAction<AwsImageModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsImage &&
      hasNodeName(diff.node, 'image') &&
      diff.field === 'imageId'
    );
  }

  async handle(
    diff: Diff<AwsImage>,
    actionInputs: EnhancedModuleSchema<AwsImageModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    // Get properties.
    const image = diff.node;

    const { uniqueImageRepositories } = actionInputs.metadata;

    for (const { awsAccountId, awsRegionId } of uniqueImageRepositories) {
      // Create ECR.
      const ecrImage = new EcrImage(`ecr-${awsRegionId}-${image.imageId}`, {
        awsAccountId,
        awsRegionId,
        imageId: image.imageId,
      });
      actionOutputs[ecrImage.resourceId] = ecrImage;
    }

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddImageModelAction>(AddImageModelAction)
export class AddImageModelActionFactory {
  private static instance: AddImageModelAction;

  static async create(): Promise<AddImageModelAction> {
    if (!this.instance) {
      this.instance = new AddImageModelAction();
    }
    return this.instance;
  }
}
