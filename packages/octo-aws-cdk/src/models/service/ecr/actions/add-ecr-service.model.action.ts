import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import { parse } from 'path';
import { EcrImage } from '../../../../resources/ecr/ecr-image.resource.js';
import { EcrService } from '../ecr.service.model.js';

@Action(ModelType.MODEL)
export class AddEcrServiceModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddEcrServiceModelAction';

  collectInput(diff: Diff): string[] {
    const imageInputs = (diff.model as EcrService).images.map((i) => `input.image.${i.imageId}.dockerExecutable`);
    return [...imageInputs];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof EcrService &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    // Get properties.
    const awsRegionIds = (diff.model as EcrService).awsRegionIds;
    const images = (diff.model as EcrService).images;

    const output: ActionOutputs = {};
    for (const awsRegionId of awsRegionIds) {
      for (const image of images) {
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

        output[ecrImage.resourceId] = ecrImage;
      }
    }

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddEcrServiceModelAction>(AddEcrServiceModelAction)
export class AddEcrServiceModelActionFactory {
  static async create(): Promise<AddEcrServiceModelAction> {
    return new AddEcrServiceModelAction();
  }
}
