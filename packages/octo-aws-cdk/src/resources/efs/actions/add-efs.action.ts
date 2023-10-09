import {
  CreateFileSystemCommand,
  CreateMountTargetCommand,
  DescribeFileSystemsCommand,
  DescribeMountTargetsCommand,
  EFSClient,
} from '@aws-sdk/client-efs';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { AwsRegion } from '../../../models/region/aws.region.model';
import { RetryUtility } from '../../../utilities/retry/retry.utility';
import { ISecurityGroupResponse } from '../../security-groups/security-group.interface';
import { SecurityGroup } from '../../security-groups/security-group.resource';
import { ISubnetResponse } from '../../subnet/subnet.interface';
import { Subnet } from '../../subnet/subnet.resource';
import { IEfsResponse, IEfsSharedMetadata } from '../efs.interface';
import { Efs } from '../efs.resource';

export class AddEfsAction implements IResourceAction {
  readonly ACTION_NAME: string = 'AddEfsAction';

  constructor(private readonly efsClient: EFSClient, private readonly region: AwsRegion) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'efs';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const efs = diff.model as Efs;
    const response = efs.response as unknown as IEfsResponse;
    const privateSubnet1 = efs.getParents('subnet')['subnet'][0].to as Subnet;
    const privateSubnet1Response = privateSubnet1.response as unknown as ISubnetResponse;
    const internalOpenSG = efs.getParents('security-group')['security-group'][0].to as SecurityGroup;
    const internalOpenSGResponse = internalOpenSG.response as unknown as ISecurityGroupResponse;

    const efsSharedMetadata: IEfsSharedMetadata =
      (response?.sharedMetadataStringified as string)?.length > 0
        ? JSON.parse(response.sharedMetadataStringified as string)
        : {};
    const sharedRegions = efsSharedMetadata.regions || [];
    const sharedRegion = sharedRegions.find((r) => r.awsRegionId === this.region.nativeAwsRegionId);

    let filesystemData: { FileSystemArn: string; FileSystemId: string };
    if (!sharedRegion) {
      // Create a new EFS.
      const data = await this.efsClient.send(
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
          const result = await this.efsClient.send(
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
        FileSystemArn: sharedRegion.FileSystemArn,
        FileSystemId: sharedRegion.FileSystemId,
      };
    }

    // Create a new EFS MountTarget. Each AWS AZ gets its own MountTarget.
    const data = await this.efsClient.send(
      new CreateMountTargetCommand({
        FileSystemId: filesystemData.FileSystemId,
        SecurityGroups: [internalOpenSGResponse.GroupId],
        SubnetId: privateSubnet1Response.SubnetId,
      }),
    );

    // Wait for EFS MountTarget to be available.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        const result = await this.efsClient.send(
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
    sharedRegions.push({
      awsRegionId: this.region.nativeAwsRegionId,
      FileSystemArn: filesystemData.FileSystemArn as string,
      FileSystemId: filesystemData.FileSystemId as string,
      IpAddress: data.IpAddress as string,
      MountTargetId: data.MountTargetId as string,
      NetworkInterfaceId: data.NetworkInterfaceId as string,
      regionId: this.region.regionId,
    });
    response.sharedMetadataStringified = JSON.stringify({
      regions: sharedRegions,
    } as IEfsSharedMetadata);
  }
}
