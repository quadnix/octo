import {
  DeleteMountTargetCommand,
  DescribeMountTargetsCommand,
  type DescribeMountTargetsCommandOutput,
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
import type { EFSClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { EfsMountTarget } from '../efs-mount-target.resource.js';

@Action(EfsMountTarget)
export class DeleteEfsMountTargetResourceAction implements IResourceAction<EfsMountTarget> {
  actionTimeoutInMs: number = 240000; // 4 minutes.

  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof EfsMountTarget &&
      (diff.node.constructor as typeof EfsMountTarget).NODE_NAME === 'efs-mount-target' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efsMountTarget = diff.node as EfsMountTarget;
    const properties = efsMountTarget.properties;
    const response = efsMountTarget.response;
    const efsMountTargetEfs = efsMountTarget.parents[0];

    // Get instances.
    const efsClient = await this.container.get<EFSClient, typeof EFSClientFactory>(EFSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

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

        const mountTarget = result!.MountTargets?.find(
          (m) => m.FileSystemId === efsMountTargetEfs.getSchemaInstance().response.FileSystemId,
        );
        if (!mountTarget) {
          return true;
        }

        if (mountTarget.LifeCycleState!.toLowerCase() === 'error') {
          throw new TransactionError('EFS FileSystem MountTarget could not be deleted!');
        }

        return mountTarget.LifeCycleState!.toLowerCase() === 'deleted';
      },
      {
        maxRetries: 36,
        retryDelayInMs: 5000,
      },
    );
  }

  async mock(diff: Diff): Promise<void> {
    const efsMountTarget = diff.node as EfsMountTarget;
    const properties = efsMountTarget.properties;
    const efsMountTargetEfs = efsMountTarget.parents[0];

    const efsClient = await this.container.get<EFSClient, typeof EFSClientFactory>(EFSClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    efsClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteMountTargetCommand) {
        return;
      } else if (instance instanceof DescribeMountTargetsCommand) {
        return {
          MountTargets: [
            { FileSystemId: efsMountTargetEfs.getSchemaInstance().response.FileSystemId, LifeCycleState: 'deleted' },
          ],
        };
      }
    };
  }
}

@Factory<DeleteEfsMountTargetResourceAction>(DeleteEfsMountTargetResourceAction)
export class DeleteEfsMountTargetResourceActionFactory {
  private static instance: DeleteEfsMountTargetResourceAction;

  static async create(): Promise<DeleteEfsMountTargetResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteEfsMountTargetResourceAction(container);
    }
    return this.instance;
  }
}
