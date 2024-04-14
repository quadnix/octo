import {
  Action,
  ActionInputs,
  ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  IModelAction,
  Image,
  ModelType,
} from '@quadnix/octo';
import { parse } from 'path';
import { EcrImage } from '../../../../resources/ecr/ecr-image.resource.js';
import { EcrService } from '../ecr.service.model.js';

@Action(ModelType.MODEL)
export class AddImageToEcrModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddImageToEcrModelAction';

  collectInput(diff: Diff): string[] {
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
    const dockerfileParts = parse(image.dockerOptions.dockerfilePath);

    // Create ECR.
    const ecrImage = new EcrImage(`ecr-${awsRegionId}-${image.imageId}`, {
      awsRegionId,
      dockerExec,
      dockerfileDirectory: dockerfileParts.dir,
      imageName: image.imageName,
      imageTag: image.imageTag,
    });

    const output: ActionOutputs = {};
    output[ecrImage.resourceId] = ecrImage;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddImageToEcrModelAction>(AddImageToEcrModelAction)
export class AddImageToEcrModelActionFactory {
  static async create(): Promise<AddImageToEcrModelAction> {
    return new AddImageToEcrModelAction();
  }
}
