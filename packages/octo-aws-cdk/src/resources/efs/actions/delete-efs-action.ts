import { DeleteFileSystemCommand, DeleteMountTargetCommand, EFSClient } from '@aws-sdk/client-efs';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IEfsProperties, IEfsResponse, IEfsSharedMetadata } from '../efs.interface.js';
import { Efs } from '../efs.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteEfsAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEfsAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'efs';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efs = diff.model as Efs;
    const properties = efs.properties as unknown as IEfsProperties;
    const response = efs.response as unknown as IEfsResponse;

    // Get instances.
    const efsClient = await Container.get(EFSClient, { args: [properties.awsRegionId] });

    const efsSharedMetadata: IEfsSharedMetadata =
      (response?.sharedMetadataStringified as string)?.length > 0
        ? JSON.parse(response.sharedMetadataStringified as string)
        : {};
    const sharedRegions = efsSharedMetadata.regions || [];
    const sharedRegion = sharedRegions.find((r) => r.regionId === properties.regionId);
    if (!sharedRegion) {
      return;
    }

    // Delete EFS MountTarget.
    await efsClient.send(new DeleteMountTargetCommand({ MountTargetId: sharedRegion!.MountTargetId }));

    // EFS should only be deleted when there are no other AWS regions referencing it.
    if (sharedRegions.filter((r) => r.awsRegionId === properties.awsRegionId).length === 1) {
      await efsClient.send(new DeleteFileSystemCommand({ FileSystemId: sharedRegion!.FileSystemId }));
    }

    // Set response.
    response.sharedMetadataStringified = JSON.stringify({
      regions: sharedRegions.filter((r) => r.regionId !== properties.regionId),
    } as IEfsSharedMetadata);
  }
}

@Factory<DeleteEfsAction>(DeleteEfsAction)
export class DeleteEfsActionFactory {
  static async create(): Promise<DeleteEfsAction> {
    return new DeleteEfsAction();
  }
}
