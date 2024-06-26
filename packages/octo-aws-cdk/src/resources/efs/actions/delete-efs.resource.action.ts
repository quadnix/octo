import {
  DeleteFileSystemCommand,
  DescribeFileSystemsCommand,
  DescribeFileSystemsCommandOutput,
  EFSClient,
} from '@aws-sdk/client-efs';
import { Action, Container, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import type { Diff } from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import type { IEfsProperties, IEfsResponse } from '../efs.interface.js';
import type { Efs } from '../efs.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteEfsResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEfsResourceAction';

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

    // Delete EFS.
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

        const filesystem = result!.FileSystems?.find((f) => f.FileSystemId === response.FileSystemId);
        if (!filesystem) {
          return true;
        }
        if (filesystem.LifeCycleState!.toLowerCase() === 'error') {
          throw new Error('EFS FileSystem could not be deleted!');
        }

        return filesystem.LifeCycleState!.toLowerCase() === 'deleted';
      },
      {
        maxRetries: 5,
        retryDelayInMs: 5000,
      },
    );
  }
}

@Factory<DeleteEfsResourceAction>(DeleteEfsResourceAction)
export class DeleteEfsResourceActionFactory {
  static async create(): Promise<DeleteEfsResourceAction> {
    return new DeleteEfsResourceAction();
  }
}
