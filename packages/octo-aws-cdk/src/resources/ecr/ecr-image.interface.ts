import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IEcrImageProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
      dockerExec: string;
      dockerfileDirectory: string;
      imageName: string;
      imageTag: string;
    }
  > {}

export interface IEcrImageResponse
  extends ModifyInterface<
    IResource['response'],
    {
      awsRegionId: string;
      registryId: string;
      repositoryArn: string;
      repositoryName: string;
      repositoryUri: string;
    }
  > {}
