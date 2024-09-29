import {
  DeleteMountTargetCommand,
  DescribeMountTargetsCommand,
  type DescribeMountTargetsCommandOutput,
  EFSClient,
} from '@aws-sdk/client-efs';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, TransactionError } from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import type { IEfsMountTargetResponse } from '../efs-mount-target.interface.js';
import { EfsMountTarget } from '../efs-mount-target.resource.js';
import type { Efs } from '../../efs/index.js';

@Action(EfsMountTarget)
export class DeleteEfsMountTargetResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof EfsMountTarget &&
      (diff.node.constructor as typeof EfsMountTarget).NODE_NAME === 'efs-mount-target'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efsMountTarget = diff.node as EfsMountTarget;
    const parents = efsMountTarget.getParents();
    const properties = efsMountTarget.properties;
    const response = efsMountTarget.response;

    const efs = parents['efs'][0].to as Efs;
    const efsResponse = efs.response;

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

        const mountTarget = result!.MountTargets?.find((m) => m.FileSystemId === efsResponse.FileSystemId);
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

  async mock(capture: Partial<IEfsMountTargetResponse>, diff: Diff): Promise<void> {
    const efsMountTarget = diff.node as EfsMountTarget;
    const parents = efsMountTarget.getParents();
    const efs = parents['efs'][0].to as Efs;
    const efsResponse = efs.response;

    const efsClient = await Container.get(EFSClient, { args: ['mock'] });
    efsClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof DeleteMountTargetCommand) {
        return;
      } else if (instance instanceof DescribeMountTargetsCommand) {
        return { MountTargets: [{ FileSystemId: efsResponse.FileSystemId, LifeCycleState: 'deleted' }] };
      }
    };
  }
}

@Factory<DeleteEfsMountTargetResourceAction>(DeleteEfsMountTargetResourceAction)
export class DeleteEfsMountTargetResourceActionFactory {
  static async create(): Promise<DeleteEfsMountTargetResourceAction> {
    return new DeleteEfsMountTargetResourceAction();
  }
}
