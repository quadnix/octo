import { CreateMountTargetCommand, DescribeMountTargetsCommand, EFSClient } from '@aws-sdk/client-efs';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { ISubnetResponse } from '../../subnet/subnet.interface.js';
import { Subnet } from '../../subnet/subnet.resource.js';
import { IEfsMountTargetProperties, IEfsMountTargetResponse } from '../efs-mount-target.interface.js';
import { EfsMountTarget } from '../efs-mount-target.resource.js';
import { IEfsResponse } from '../efs.interface.js';
import { Efs } from '../efs.resource.js';

@Action(ModelType.RESOURCE)
export class AddEfsMountTargetResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEfsMountTargetResourceAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'efs-mount-target';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efsMountTarget = diff.model as EfsMountTarget;
    const parents = efsMountTarget.getParents();
    const properties = efsMountTarget.properties as unknown as IEfsMountTargetProperties;
    const response = efsMountTarget.response as unknown as IEfsMountTargetResponse;

    const efs = parents['efs'][0].to as Efs;
    const efsResponse = efs.response as unknown as IEfsResponse;
    const subnet = parents['subnet'][0].to as Subnet;
    const subnetResponse = subnet.response as unknown as ISubnetResponse;

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
          throw new Error('EFS FileSystem MountTarget does not exist!');
        }
        if (mountTarget.LifeCycleState!.toLowerCase() === 'error') {
          throw new Error('EFS FileSystem MountTarget could not be created!');
        }

        return mountTarget.LifeCycleState!.toLowerCase() === 'available';
      },
      {
        maxRetries: 36,
        retryDelayInMs: 5000,
      },
    );

    // Set response.
    response.MountTargetId = data.MountTargetId as string;
    response.NetworkInterfaceId = data.NetworkInterfaceId as string;
  }
}

@Factory<AddEfsMountTargetResourceAction>(AddEfsMountTargetResourceAction)
export class AddEfsMountTargetResourceActionFactory {
  static async create(): Promise<AddEfsMountTargetResourceAction> {
    return new AddEfsMountTargetResourceAction();
  }
}
