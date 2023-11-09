import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, Image, ModelType } from '@quadnix/octo';
import { SharedEcrImage } from '../../../resources/ecr/ecr-image.shared-resource.js';
import { AAction } from '../../action.abstract.js';
import { EcrImage } from '../ecr.image.model.js';

@Action(ModelType.MODEL)
export class DeleteImageAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteImageAction';

  override collectInput(diff: Diff): string[] {
    const { imageName, imageTag } = diff.model as Image;
    const image = `${imageName}:${imageTag}`;

    return [`resource.image-${image}`];
  }

  override collectOutput(diff: Diff): string[] {
    const { imageName, imageTag } = diff.model as Image;
    const image = `${imageName}:${imageTag}`;

    return [`image-${image}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'image' && diff.field === 'imageId';
  }

  handle(diff: Diff, actionInputs: ActionInputs): ActionOutputs {
    const { awsRegionId, imageName, imageTag } = diff.model as EcrImage;
    const image = `${imageName}:${imageTag}`;

    const sharedEcrImage = actionInputs[`resource.image-${image}`] as SharedEcrImage;
    sharedEcrImage.markUpdated('regions', `DELETE:${awsRegionId}`);

    const output: ActionOutputs = {};
    output[`image-${image}`] = sharedEcrImage;

    return output;
  }
}

@Factory<DeleteImageAction>(DeleteImageAction)
export class DeleteImageActionFactory {
  static async create(): Promise<DeleteImageAction> {
    return new DeleteImageAction();
  }
}
