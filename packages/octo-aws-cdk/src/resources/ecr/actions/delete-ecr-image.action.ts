import { BatchDeleteImageCommand, ECRClient } from '@aws-sdk/client-ecr';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IEcrImageProperties } from '../ecr-image.interface';
import { EcrImage } from '../ecr-image.resource';

export class DeleteEcrImageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEcrImageAction';

  constructor(private readonly ecrClient: ECRClient) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'ecr-image';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.model as EcrImage;
    const properties = ecrImage.properties as unknown as IEcrImageProperties;

    // Delete Image.
    await this.ecrClient.send(
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
