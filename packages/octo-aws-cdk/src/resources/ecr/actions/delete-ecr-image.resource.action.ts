import { BatchDeleteImageCommand, ECRClient } from '@aws-sdk/client-ecr';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import { EcrImage } from '../ecr-image.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteEcrImageResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEcrImageResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model instanceof EcrImage && diff.model.MODEL_NAME === 'ecr-image';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.model as EcrImage;
    const properties = ecrImage.properties;

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

  async mock(): Promise<void> {
    const ecrClient = await Container.get(ECRClient);
    ecrClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof BatchDeleteImageCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteEcrImageResourceAction>(DeleteEcrImageResourceAction)
export class DeleteEcrImageResourceActionFactory {
  static async create(): Promise<DeleteEcrImageResourceAction> {
    return new DeleteEcrImageResourceAction();
  }
}
