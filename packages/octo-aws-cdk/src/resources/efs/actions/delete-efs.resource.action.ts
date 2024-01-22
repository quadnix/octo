import {
  DeleteFileSystemCommand,
  DeleteMountTargetCommand,
  DescribeFileSystemsCommand,
  DescribeFileSystemsCommandOutput,
  DescribeMountTargetsCommand,
  DescribeMountTargetsCommandOutput,
  EFSClient,
} from '@aws-sdk/client-efs';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { IEfsProperties, IEfsResponse } from '../efs.interface.js';
import { Efs } from '../efs.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteEfsResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEfsResourceAction';

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

    // Wait for EFS MountTarget to be deleted.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        let result: DescribeMountTargetsCommandOutput;

        try {
          result = await efsClient.send(
            new DescribeMountTargetsCommand({
              MountTargetId: response.MountTargetId,
            }),
          );
        } catch (error) {
          if (error.ErrorCode === 'MountTargetNotFound') {
            return true;
          } else {
            throw error;
          }
        }

        const mountTarget = result!.MountTargets?.find((m) => m.FileSystemId === response.FileSystemId);
        if (!mountTarget) {
          return true;
        }

        if (mountTarget.LifeCycleState!.toLowerCase() === 'error') {
          throw new Error('EFS FileSystem MountTarget could not be deleted!');
        }

        return mountTarget.LifeCycleState!.toLowerCase() === 'deleted';
      },
      {
        maxRetries: 36,
        retryDelayInMs: 5000,
      },
    );

    // EFS should only be deleted when there are no other AWS regions referencing it.
    if (!efsSharedMetadata) {
      await efsClient.send(new DeleteFileSystemCommand({ FileSystemId: response.FileSystemId }));

      // Wait for EFS to be deleted.
      await RetryUtility.retryPromise(
        async (): Promise<boolean> => {
          let result: DescribeFileSystemsCommandOutput;

          try {
            result = await efsClient.send(
              new DescribeFileSystemsCommand({
                FileSystemId: response.FileSystemId,
              }),
            );
          } catch (error) {
            if (error.ErrorCode === 'FileSystemNotFound') {
              return true;
            } else {
              throw error;
            }
          }

          const fileSystem = result!.FileSystems?.find((f) => f.FileSystemId === response.FileSystemId);
          if (!fileSystem) {
            return true;
          }
          if (fileSystem.LifeCycleState!.toLowerCase() === 'error') {
            throw new Error('EFS FileSystem could not be deleted!');
          }

          return fileSystem.LifeCycleState!.toLowerCase() === 'deleted';
        },
        {
          maxRetries: 5,
          retryDelayInMs: 5000,
        },
      );
    }
  }
}

@Factory<DeleteEfsResourceAction>(DeleteEfsResourceAction)
export class DeleteEfsResourceActionFactory {
  static async create(): Promise<DeleteEfsResourceAction> {
    return new DeleteEfsResourceAction();
  }
}
