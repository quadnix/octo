import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import { EcrImage } from '../../../../../../resources/ecr/index.js';
import { type AwsImageModule } from '../../../aws-image.module.js';
import { AwsImage } from '../aws.image.model.js';

@Action(AwsImage)
export class AddImageModelAction implements IModelAction<AwsImageModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsImage &&
      (diff.node.constructor as typeof AwsImage).NODE_NAME === 'image' &&
      diff.field === 'imageId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsImageModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    // Get properties.
    const image = diff.node as AwsImage;

    const { uniqueImageRepositories } = actionInputs.metadata as Awaited<
      ReturnType<AwsImageModule['registerMetadata']>
    >;

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
