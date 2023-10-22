import { BatchDeleteImageCommand, ECRClient } from '@aws-sdk/client-ecr';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { AwsRegion } from '../../../models/region/aws.region.model.js';
import { IEcrImageProperties, IEcrImageReplicationMetadata, IEcrImageResponse } from '../ecr-image.interface.js';
import { EcrImage } from '../ecr-image.resource.js';

export class DeleteEcrImageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEcrImageAction';

  constructor(private readonly ecrClient: ECRClient, private readonly region: AwsRegion) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'ecr-image';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.model as EcrImage;
    const properties = ecrImage.properties as unknown as IEcrImageProperties;
    const response = ecrImage.response as unknown as IEcrImageResponse;

    const ecrImageReplicationMetadata: IEcrImageReplicationMetadata =
      (response?.replicationsStringified as string)?.length > 0
        ? JSON.parse(response.replicationsStringified as string)
        : {};
    const replicationRegions = ecrImageReplicationMetadata.regions || [];

    // Image should only be deleted when there are no other AWS regions referencing it.
    if (replicationRegions.filter((r) => r.awsRegionId === this.region.nativeAwsRegionId).length === 1) {
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

    // Set response.
    response.replicationsStringified = JSON.stringify({
      regions: replicationRegions.filter((r) => r.regionId !== this.region.regionId),
    } as IEcrImageReplicationMetadata);
  }
}
