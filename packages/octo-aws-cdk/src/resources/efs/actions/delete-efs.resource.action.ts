import {
  DeleteFileSystemCommand,
  DescribeFileSystemsCommand,
  type DescribeFileSystemsCommandOutput,
  EFSClient,
} from '@aws-sdk/client-efs';
import {
  Action,
  Container,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  TransactionError,
} from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { Efs } from '../efs.resource.js';
import type { EfsSchema } from '../efs.schema.js';

@Action(Efs)
export class DeleteEfsResourceAction implements IResourceAction<Efs> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof Efs &&
      (diff.node.constructor as typeof Efs).NODE_NAME === 'efs'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efs = diff.node as Efs;
    const properties = efs.properties;
    const response = efs.response;

    // Get instances.
    const efsClient = await this.container.get(EFSClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });

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

  async mock(diff: Diff, capture: Partial<EfsSchema['response']>): Promise<void> {
    // Get properties.
    const efs = diff.node as Efs;
    const properties = efs.properties;

    const efsClient = await this.container.get(EFSClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    efsClient.send = async (instance: unknown): Promise<unknown> => {
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
    const container = Container.getInstance();
    return new DeleteEfsResourceAction(container);
  }
}
