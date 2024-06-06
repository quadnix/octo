import {
  DeleteMountTargetCommand,
  DescribeMountTargetsCommand,
  type DescribeMountTargetsCommandOutput,
  EFSClient,
} from '@aws-sdk/client-efs';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import type { IEfsMountTargetProperties, IEfsMountTargetResponse } from '../efs-mount-target.interface.js';
import type { EfsMountTarget } from '../efs-mount-target.resource.js';
import type { IEfsResponse } from '../efs.interface.js';
import type { Efs } from '../efs.resource.js';

@Action(ModelType.RESOURCE)
export class DeleteEfsMountTargetResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteEfsMountTargetResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'efs-mount-target';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efsMountTarget = diff.model as EfsMountTarget;
    const parents = efsMountTarget.getParents();
    const properties = efsMountTarget.properties as unknown as IEfsMountTargetProperties;
    const response = efsMountTarget.response as unknown as IEfsMountTargetResponse;

    const efs = parents['efs'][0].to as Efs;
    const efsResponse = efs.response as unknown as IEfsResponse;

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
          throw new Error('EFS FileSystem MountTarget could not be deleted!');
        }

        return mountTarget.LifeCycleState!.toLowerCase() === 'deleted';
      },
      {
        maxRetries: 36,
        retryDelayInMs: 5000,
      },
    );
  }
}

@Factory<DeleteEfsMountTargetResourceAction>(DeleteEfsMountTargetResourceAction)
export class DeleteEfsMountTargetResourceActionFactory {
  static async create(): Promise<DeleteEfsMountTargetResourceAction> {
    return new DeleteEfsMountTargetResourceAction();
  }
}
