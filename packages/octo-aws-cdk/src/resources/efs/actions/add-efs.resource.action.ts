import { CreateFileSystemCommand, DescribeFileSystemsCommand, EFSClient } from '@aws-sdk/client-efs';
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
export class AddEfsResourceAction implements IResourceAction<Efs> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof Efs &&
      (diff.node.constructor as typeof Efs).NODE_NAME === 'efs' &&
      diff.field === 'resourceId'
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

  async mock(diff: Diff, capture: Partial<EfsSchema['response']>): Promise<void> {
    // Get properties.
    const efs = diff.node as Efs;
    const properties = efs.properties;

    const efsClient = await this.container.get(EFSClient, {
      metadata: { awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    efsClient.send = async (instance: unknown): Promise<unknown> => {
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
  private static instance: AddEfsResourceAction;

  static async create(): Promise<AddEfsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddEfsResourceAction(container);
    }
    return this.instance;
  }
}
