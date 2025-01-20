import { CreateMountTargetCommand, DescribeMountTargetsCommand, EFSClient } from '@aws-sdk/client-efs';
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
import { EfsMountTarget } from '../efs-mount-target.resource.js';
import type { EfsMountTargetEfs, EfsMountTargetSchema, EfsMountTargetSubnet } from '../efs-mount-target.schema.js';

@Action(EfsMountTarget)
export class AddEfsMountTargetResourceAction implements IResourceAction<EfsMountTarget> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof EfsMountTarget &&
      (diff.node.constructor as typeof EfsMountTarget).NODE_NAME === 'efs-mount-target' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efsMountTarget = diff.node as EfsMountTarget;
    const parents = efsMountTarget.getParents();
    const properties = efsMountTarget.properties;
    const response = efsMountTarget.response;

    const efs = parents['efs'][0].to as EfsMountTargetEfs;
    const efsResponse = efs.response;
    const subnet = parents['subnet'][0].to as EfsMountTargetSubnet;
    const subnetResponse = subnet.response;

    // Get instances.
    const efsClient = await this.container.get(EFSClient, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
    });

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

  async mock(diff: Diff, capture: Partial<EfsMountTargetSchema['response']>): Promise<void> {
    const efsMountTarget = diff.node as EfsMountTarget;
    const parents = efsMountTarget.getParents();
    const properties = efsMountTarget.properties;
    const efs = parents['efs'][0].to as EfsMountTargetEfs;
    const efsResponse = efs.response;

    const efsClient = await this.container.get(EFSClient, {
      metadata: { awsAccountId: properties.awsAccountId, awsRegionId: properties.awsRegionId, package: '@octo' },
    });
    efsClient.send = async (instance: unknown): Promise<unknown> => {
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
  private static instance: AddEfsMountTargetResourceAction;

  static async create(): Promise<AddEfsMountTargetResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddEfsMountTargetResourceAction(container);
    }
    return this.instance;
  }
}
