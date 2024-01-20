import { BatchDeleteImageCommand, ECRClient } from '@aws-sdk/client-ecr';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IEcrImageProperties } from '../ecr-image.interface.js';
import { EcrImage } from '../ecr-image.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteEcrImageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEcrImageAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'ecr-image';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.model as EcrImage;
    const properties = ecrImage.properties as unknown as IEcrImageProperties;

    // Get instances.
    const ecrClient = await Container.get(ECRClient, { args: [properties.awsRegionId] });

    await ecrClient.send(
      new BatchDeleteImageCommand({
        imageIds: [
          {
            imageTag: properties.imageTag,
          },
        ],
        repositoryName: properties.imageName,
      }),
    );
  }
}

@Factory<DeleteEcrImageAction>(DeleteEcrImageAction)
export class DeleteEcrImageActionFactory {
  static async create(): Promise<DeleteEcrImageAction> {
    return new DeleteEcrImageAction();
  }
}
