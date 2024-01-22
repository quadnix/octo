import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, Image, ModelType } from '@quadnix/octo';
import { EcrImage } from '../../../../resources/ecr/ecr-image.resource.js';
import { AAction } from '../../../action.abstract.js';
import { EcrService } from '../ecr.service.model.js';

@Action(ModelType.MODEL)
export class DeleteImageFromEcrModelAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteImageFromEcrModelAction';

  override collectInput(diff: Diff): string[] {
    const { awsRegionId, image } = diff.value as { awsRegionId: string; image: Image };

    return [`resource.${awsRegionId}-${image.imageId}-ecr`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model.MODEL_NAME === 'service' &&
      (diff.model as EcrService).serviceId.endsWith('ecr') &&
      diff.field === 'images'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const { awsRegionId, image } = diff.value as { awsRegionId: string; image: Image };
    const ecrImage = actionInputs[`resource.${awsRegionId}-${image.imageId}-ecr`] as EcrImage;
    ecrImage.markDeleted();

    const output: ActionOutputs = {};
    output[ecrImage.resourceId] = ecrImage;

    return output;
  }
}

@Factory<DeleteImageFromEcrModelAction>(DeleteImageFromEcrModelAction)
export class DeleteImageFromEcrModelActionFactory {
  static async create(): Promise<DeleteImageFromEcrModelAction> {
    return new DeleteImageFromEcrModelAction();
  }
}
