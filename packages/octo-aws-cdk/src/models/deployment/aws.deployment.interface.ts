import type { IDeployment, IModelReference } from '@quadnix/octo';

export interface IAwsDeployment extends IDeployment {
  deploymentFolderRemotePath: string;
  s3StorageService: IModelReference;
}
