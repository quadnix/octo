import {
  DeleteFileSystemCommand,
  DescribeFileSystemsCommand,
  type DescribeFileSystemsCommandOutput,
  EFSClient,
} from '@aws-sdk/client-efs';
import {
  Action,
  Container,
  Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  NodeType,
  TransactionError,
} from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import type { IEfsResponse } from '../efs.interface.js';
import { Efs } from '../efs.resource.js';

@Action(NodeType.RESOURCE)
export class DeleteEfsResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEfsResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.node instanceof Efs && diff.node.NODE_NAME === 'efs';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efs = diff.node as Efs;
    const properties = efs.properties;
    const response = efs.response;

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
          throw new TransactionError('EFS FileSystem could not be deleted!');
        }

        return filesystem.LifeCycleState!.toLowerCase() === 'deleted';
      },
      {
        maxRetries: 5,
        retryDelayInMs: 5000,
      },
    );
  }

  async mock(capture: Partial<IEfsResponse>): Promise<void> {
    const efsClient = await Container.get(EFSClient, { args: ['mock'] });
    efsClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof DeleteFileSystemCommand) {
        return;
      } else if (instance instanceof DescribeFileSystemsCommand) {
        return { FileSystems: [{ FileSystemId: capture.FileSystemId, LifeCycleState: 'deleted' }] };
      }
    };
  }
}

@Factory<DeleteEfsResourceAction>(DeleteEfsResourceAction)
export class DeleteEfsResourceActionFactory {
  static async create(): Promise<DeleteEfsResourceAction> {
    return new DeleteEfsResourceAction();
  }
}
