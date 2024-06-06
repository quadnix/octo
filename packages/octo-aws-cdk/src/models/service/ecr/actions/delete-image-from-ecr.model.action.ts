import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  Image,
  ModelType,
} from '@quadnix/octo';
import { EcrImage } from '../../../../resources/ecr/ecr-image.resource.js';
import { EcrService } from '../ecr.service.model.js';

@Action(ModelType.MODEL)
export class DeleteImageFromEcrModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteImageFromEcrModelAction';

  collectInput(diff: Diff): string[] {
    const { awsRegionId, image } = diff.value as { awsRegionId: string; image: Image };

    return [`resource.ecr-${awsRegionId}-${image.imageId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof EcrService &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'images'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const { awsRegionId, image } = diff.value as { awsRegionId: string; image: Image };
    const ecrImage = actionInputs[`resource.ecr-${awsRegionId}-${image.imageId}`] as EcrImage;
    ecrImage.markDeleted();

    const output: ActionOutputs = {};
    output[ecrImage.resourceId] = ecrImage;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteImageFromEcrModelAction>(DeleteImageFromEcrModelAction)
export class DeleteImageFromEcrModelActionFactory {
  static async create(): Promise<DeleteImageFromEcrModelAction> {
    return new DeleteImageFromEcrModelAction();
  }
}
