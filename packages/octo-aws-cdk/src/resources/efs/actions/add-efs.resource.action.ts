import { CreateFileSystemCommand, DescribeFileSystemsCommand, EFSClient } from '@aws-sdk/client-efs';
import {
  Action,
  Container,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { EFSClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { Efs } from '../efs.resource.js';
import type { EfsSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(Efs)
export class AddEfsResourceAction implements IResourceAction<Efs> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof Efs &&
      hasNodeName(diff.node, 'efs') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<Efs>): Promise<EfsSchema['response']> {
    // Get properties.
    const efs = diff.node;
    const properties = efs.properties;
    const tags = efs.tags;

    // Get instances.
    const efsClient = await this.container.get<EFSClient, typeof EFSClientFactory>(EFSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create a new EFS.
    const data = await efsClient.send(
      new CreateFileSystemCommand({
        Backup: false,
        Encrypted: false,
        PerformanceMode: 'generalPurpose',
        Tags:
          Object.keys(tags).length > 0
            ? Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value }))
            : undefined,
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

    return {
      FileSystemArn: data.FileSystemArn!,
      FileSystemId: data.FileSystemId!,
    };
  }

  async mock(_diff: Diff<Efs>, capture: Partial<EfsSchema['response']>): Promise<EfsSchema['response']> {
    return {
      FileSystemArn: capture.FileSystemArn!,
      FileSystemId: capture.FileSystemId!,
    };
  }
}

/**
 * @internal
 */
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
