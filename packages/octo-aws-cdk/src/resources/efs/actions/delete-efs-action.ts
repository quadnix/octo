import { DeleteFileSystemCommand, DeleteMountTargetCommand, EFSClient } from '@aws-sdk/client-efs';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IEfsProperties, IEfsResponse } from '../efs.interface.js';
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
    const efsSharedMetadata = diff.value as { FileSystemArn: string; FileSystemId: string } | undefined;
    const properties = efs.properties as unknown as IEfsProperties;
    const response = efs.response as unknown as IEfsResponse;

    // Get instances.
    const efsClient = await Container.get(EFSClient, { args: [properties.awsRegionId] });

    // Delete EFS MountTarget.
    await efsClient.send(new DeleteMountTargetCommand({ MountTargetId: response.MountTargetId }));

    // EFS should only be deleted when there are no other AWS regions referencing it.
    if (!efsSharedMetadata) {
      await efsClient.send(new DeleteFileSystemCommand({ FileSystemId: response.FileSystemId }));
    }
  }
}

@Factory<DeleteEfsAction>(DeleteEfsAction)
export class DeleteEfsActionFactory {
  static async create(): Promise<DeleteEfsAction> {
    return new DeleteEfsAction();
  }
}
