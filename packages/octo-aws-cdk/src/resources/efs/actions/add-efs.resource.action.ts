import { CreateFileSystemCommand, DescribeFileSystemsCommand, EFSClient } from '@aws-sdk/client-efs';
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
export class AddEfsResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEfsResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.node instanceof Efs && diff.node.NODE_NAME === 'efs';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efs = diff.node as Efs;
    const properties = efs.properties;
    const response = efs.response;

    // Get instances.
    const efsClient = await Container.get(EFSClient, { args: [properties.awsRegionId] });

    // Create a new EFS.
    const data = await efsClient.send(
      new CreateFileSystemCommand({
        Backup: false,
        Encrypted: false,
        PerformanceMode: 'generalPurpose',
        ThroughputMode: 'bursting',
      }),
    );

    // Wait for EFS to be available.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        const result = await efsClient.send(
          new DescribeFileSystemsCommand({
            FileSystemId: data.FileSystemId,
          }),
        );

        const filesystem = result.FileSystems?.find((f) => f.FileSystemId === data.FileSystemId);
        if (!filesystem) {
          throw new TransactionError('EFS FileSystem does not exist!');
        }
        if (filesystem.LifeCycleState!.toLowerCase() === 'error') {
          throw new TransactionError('EFS FileSystem could not be created!');
        }

        return filesystem.LifeCycleState!.toLowerCase() === 'available';
      },
      {
        maxRetries: 5,
        retryDelayInMs: 5000,
      },
    );

    // Set response.
    response.FileSystemArn = data.FileSystemArn!;
    response.FileSystemId = data.FileSystemId!;
  }

  async mock(capture: Partial<IEfsResponse>): Promise<void> {
    const efsClient = await Container.get(EFSClient, { args: ['mock'] });
    efsClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateFileSystemCommand) {
        return { FileSystemArn: capture.FileSystemArn, FileSystemId: capture.FileSystemId };
      } else if (instance instanceof DescribeFileSystemsCommand) {
        return { FileSystems: [{ FileSystemId: capture.FileSystemId, LifeCycleState: 'available' }] };
      }
    };
  }
}

@Factory<AddEfsResourceAction>(AddEfsResourceAction)
export class AddEfsResourceActionFactory {
  static async create(): Promise<AddEfsResourceAction> {
    return new AddEfsResourceAction();
  }
}
