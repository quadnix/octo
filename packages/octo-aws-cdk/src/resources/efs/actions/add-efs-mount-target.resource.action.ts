import { CreateMountTargetCommand, DescribeMountTargetsCommand, EFSClient } from '@aws-sdk/client-efs';
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
import type { Subnet } from '../../subnet/subnet.resource.js';
import type { IEfsMountTargetResponse } from '../efs-mount-target.interface.js';
import { EfsMountTarget } from '../efs-mount-target.resource.js';
import type { Efs } from '../efs.resource.js';

@Action(NodeType.RESOURCE)
export class AddEfsMountTargetResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEfsMountTargetResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof EfsMountTarget &&
      diff.node.NODE_NAME === 'efs-mount-target'
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
    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response;

    // Get instances.
    const efsClient = await Container.get(EFSClient, { args: [properties.awsRegionId] });

    // Create a new EFS MountTarget.
    const data = await efsClient.send(
      new CreateMountTargetCommand({
        FileSystemId: efsResponse.FileSystemId,
        SecurityGroups: [],
        SubnetId: subnetResponse.SubnetId,
      }),
    );

    // Wait for EFS MountTarget to be available.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        const result = await efsClient.send(
          new DescribeMountTargetsCommand({
            MountTargetId: data.MountTargetId,
          }),
        );

        const mountTarget = result.MountTargets?.find((m) => m.FileSystemId === efsResponse.FileSystemId);
        if (!mountTarget) {
          throw new TransactionError('EFS FileSystem MountTarget does not exist!');
        }
        if (mountTarget.LifeCycleState!.toLowerCase() === 'error') {
          throw new TransactionError('EFS FileSystem MountTarget could not be created!');
        }

        return mountTarget.LifeCycleState!.toLowerCase() === 'available';
      },
      {
        maxRetries: 36,
        retryDelayInMs: 5000,
      },
    );

    // Set response.
    response.MountTargetId = data.MountTargetId!;
    response.NetworkInterfaceId = data.NetworkInterfaceId!;
  }

  async mock(capture: Partial<IEfsMountTargetResponse>, diff: Diff): Promise<void> {
    const efsMountTarget = diff.node as EfsMountTarget;
    const parents = efsMountTarget.getParents();
    const efs = parents['efs'][0].to as Efs;
    const efsResponse = efs.response;

    const efsClient = await Container.get(EFSClient, { args: ['mock'] });
    efsClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreateMountTargetCommand) {
        return { MountTargetId: capture.MountTargetId, NetworkInterfaceId: capture.NetworkInterfaceId };
      } else if (instance instanceof DescribeMountTargetsCommand) {
        return { MountTargets: [{ FileSystemId: efsResponse.FileSystemId, LifeCycleState: 'available' }] };
      }
    };
  }
}

@Factory<AddEfsMountTargetResourceAction>(AddEfsMountTargetResourceAction)
export class AddEfsMountTargetResourceActionFactory {
  static async create(): Promise<AddEfsMountTargetResourceAction> {
    return new AddEfsMountTargetResourceAction();
  }
}
