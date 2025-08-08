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
import type { AwsEcrImageModule } from '../../../aws-ecr-image.module.js';
import { AwsEcrImage } from '../aws-ecr-image.model.js';

/**
 * @internal
 */
@Action(AwsEcrImage)
export class AddAwsEcrImageModelAction implements IModelAction<AwsEcrImageModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcrImage &&
      hasNodeName(diff.node, 'image') &&
      diff.field === 'imageId'
    );
  }

  async handle(
    diff: Diff<AwsEcrImage>,
    actionInputs: EnhancedModuleSchema<AwsEcrImageModule>,
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
@Factory<AddAwsEcrImageModelAction>(AddAwsEcrImageModelAction)
export class AddAwsEcrImageModelActionFactory {
  private static instance: AddAwsEcrImageModelAction;

  static async create(): Promise<AddAwsEcrImageModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcrImageModelAction();
    }
    return this.instance;
  }
}
