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
import { parse } from 'path';
import { EcrImage } from '../../../../resources/ecr/ecr-image.resource.js';
import { EcrService } from '../ecr.service.model.js';

@Action(ModelType.MODEL)
export class AddImageToEcrModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddImageToEcrModelAction';

  collectInput(): string[] {
    return ['input.image.dockerExecutable'];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof EcrService &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'images'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    // Get properties.
    const { awsRegionId, image } = diff.value as { awsRegionId: string; image: Image };

    const dockerExec = actionInputs['input.image.dockerExecutable'] as string;
    const dockerfileParts = parse(image.dockerOptions.dockerfilePath);

    // Create ECR.
    const ecrImage = new EcrImage(`ecr-${awsRegionId}-${image.imageId}`, {
      awsRegionId,
      dockerExec,
      dockerfileDirectory: dockerfileParts.dir,
      imageName: image.imageName,
      imageTag: image.imageTag,
    });
    actionOutputs[ecrImage.resourceId] = ecrImage;

    return actionOutputs;
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
