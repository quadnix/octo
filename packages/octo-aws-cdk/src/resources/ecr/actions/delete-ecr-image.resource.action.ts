import { BatchDeleteImageCommand, ECRClient } from '@aws-sdk/client-ecr';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EcrImage } from '../ecr-image.resource.js';

@Action(EcrImage)
export class DeleteEcrImageResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof EcrImage &&
      (diff.node.constructor as typeof EcrImage).NODE_NAME === 'ecr-image'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.node as EcrImage;
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
    const ecrClient = await Container.get(ECRClient, { args: ['mock'] });
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
