import { DeleteFileSystemCommand, DeleteMountTargetCommand, EFSClient } from '@aws-sdk/client-efs';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { AwsRegion } from '../../../models/region/aws.region.model.js';
import { IEfsResponse, IEfsSharedMetadata } from '../efs.interface.js';
import { Efs } from '../efs.resource.js';

export class DeleteEfsAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEfsAction';

  constructor(private readonly efsClient: EFSClient, private readonly region: AwsRegion) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'efs';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efs = diff.model as Efs;
    const response = efs.response as unknown as IEfsResponse;

    const efsSharedMetadata: IEfsSharedMetadata =
      (response?.sharedMetadataStringified as string)?.length > 0
        ? JSON.parse(response.sharedMetadataStringified as string)
        : {};
    const sharedRegions = efsSharedMetadata.regions || [];
    const sharedRegion = sharedRegions.find((r) => r.regionId === this.region.regionId);
    if (!sharedRegion) {
      return;
    }

    // Delete EFS MountTarget.
    await this.efsClient.send(new DeleteMountTargetCommand({ MountTargetId: sharedRegion!.MountTargetId }));

    // EFS should only be deleted when there are no other AWS regions referencing it.
    if (sharedRegions.filter((r) => r.awsRegionId === this.region.nativeAwsRegionId).length === 1) {
      await this.efsClient.send(new DeleteFileSystemCommand({ FileSystemId: sharedRegion!.FileSystemId }));
    }

    // Set response.
    response.sharedMetadataStringified = JSON.stringify({
      regions: sharedRegions.filter((r) => r.regionId !== this.region.regionId),
    } as IEfsSharedMetadata);
  }
}
