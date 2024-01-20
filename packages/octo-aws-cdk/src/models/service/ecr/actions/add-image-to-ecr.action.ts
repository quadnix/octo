import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, Image, ModelType } from '@quadnix/octo';
import { parse } from 'path';
import { EcrImage } from '../../../../resources/ecr/ecr-image.resource.js';
import { AAction } from '../../../action.abstract.js';
import { EcrService } from '../ecr.service.model.js';

@Action(ModelType.MODEL)
export class AddImageToEcrAction extends AAction {
  readonly ACTION_NAME: string = 'AddImageToEcrAction';

  override collectInput(diff: Diff): string[] {
    const { image } = diff.value as { image: Image };

    return [`input.image.${image.imageId}.dockerExecutable`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model.MODEL_NAME === 'service' &&
      (diff.model as EcrService).serviceId.endsWith('ecr') &&
      diff.field === 'images'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    // Get properties.
    const { awsRegionId, image } = diff.value as { awsRegionId: string; image: Image };

    const dockerExec = actionInputs[`input.image.${image.imageId}.dockerExecutable`] as string;
    const dockerFileParts = parse(image.dockerOptions.dockerFilePath);

    // Create ECR.
    const ecrImage = new EcrImage(`${awsRegionId}-${image.imageId}-ecr`, {
      awsRegionId,
      dockerExec,
      dockerFileDirectory: dockerFileParts.dir,
      imageName: image.imageName,
      imageTag: image.imageTag,
    });

    const output: ActionOutputs = {};
    output[ecrImage.resourceId] = ecrImage;

    return output;
  }
}

@Factory<AddImageToEcrAction>(AddImageToEcrAction)
export class AddImageToEcrActionFactory {
  static async create(): Promise<AddImageToEcrAction> {
    return new AddImageToEcrAction();
  }
}
