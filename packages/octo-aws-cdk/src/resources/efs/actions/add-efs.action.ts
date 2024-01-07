import {
  CreateFileSystemCommand,
  CreateMountTargetCommand,
  DescribeFileSystemsCommand,
  DescribeMountTargetsCommand,
  EFSClient,
} from '@aws-sdk/client-efs';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { ISecurityGroupResponse } from '../../security-groups/security-group.interface.js';
import { SecurityGroup } from '../../security-groups/security-group.resource.js';
import { ISubnetResponse } from '../../subnet/subnet.interface.js';
import { Subnet } from '../../subnet/subnet.resource.js';
import { IEfsProperties, IEfsResponse } from '../efs.interface.js';
import { Efs } from '../efs.resource.js';

@Action(ModelType.RESOURCE)
export class AddEfsAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEfsAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'efs';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efs = diff.model as Efs;
    const efsSharedMetadata = diff.value as { FileSystemArn: string; FileSystemId: string } | undefined;
    const properties = efs.properties as unknown as IEfsProperties;
    const response = efs.response as unknown as IEfsResponse;
    const privateSubnet1 = efs.getParents('subnet')['subnet'][0].to as Subnet;
    const privateSubnet1Response = privateSubnet1.response as unknown as ISubnetResponse;
    const internalOpenSG = efs.getParents('security-group')['security-group'][0].to as SecurityGroup;
    const internalOpenSGResponse = internalOpenSG.response as unknown as ISecurityGroupResponse;

    // Get instances.
    const efsClient = await Container.get(EFSClient, { args: [properties.awsRegionId] });

    let filesystemData: { FileSystemArn: string; FileSystemId: string };
    if (!efsSharedMetadata) {
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

          if (!result.FileSystems!.length) {
            throw new Error('EFS FileSystem does not exist!');
          }
          const state = result.FileSystems![0].LifeCycleState!;
          if (state.toLowerCase() === 'error') {
            throw new Error('EFS FileSystem could not be created!');
          }

          return state.toLowerCase() === 'available';
        },
        {
          retryDelayInMs: 2000,
        },
      );

      filesystemData = {
        FileSystemArn: data.FileSystemArn as string,
        FileSystemId: data.FileSystemId as string,
      };
    } else {
      filesystemData = {
        FileSystemArn: efsSharedMetadata.FileSystemArn,
        FileSystemId: efsSharedMetadata.FileSystemId,
      };
    }

    // Create a new EFS MountTarget. Each AWS AZ gets its own MountTarget.
    const data = await efsClient.send(
      new CreateMountTargetCommand({
        FileSystemId: filesystemData.FileSystemId,
        SecurityGroups: [internalOpenSGResponse.GroupId],
        SubnetId: privateSubnet1Response.SubnetId,
      }),
    );

    // Wait for EFS MountTarget to be available.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        const result = await efsClient.send(
          new DescribeMountTargetsCommand({
            FileSystemId: filesystemData.FileSystemId,
            MountTargetId: data.MountTargetId,
          }),
        );

        if (!result.MountTargets!.length) {
          throw new Error('EFS FileSystem MountTarget does not exist!');
        }
        const state = result.MountTargets![0].LifeCycleState!;
        if (state.toLowerCase() === 'error') {
          throw new Error('EFS FileSystem MountTarget could not be created!');
        }

        return state.toLowerCase() === 'available';
      },
      {
        retryDelayInMs: 2000,
      },
    );

    // Set response.
    response.awsRegionId = properties.awsRegionId;
    response.FileSystemArn = filesystemData.FileSystemArn;
    response.FileSystemId = filesystemData.FileSystemId;
    response.IpAddress = data.IpAddress as string;
    response.MountTargetId = data.MountTargetId as string;
    response.NetworkInterfaceId = data.NetworkInterfaceId as string;
    response.regionId = properties.regionId;
  }
}

@Factory<AddEfsAction>(AddEfsAction)
export class AddEfsActionFactory {
  static async create(): Promise<AddEfsAction> {
    return new AddEfsAction();
  }
}
