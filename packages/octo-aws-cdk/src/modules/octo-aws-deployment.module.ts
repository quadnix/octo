import { type ActionInputs, ActionOutputs, Diff, Module } from '@quadnix/octo';
import { join, resolve } from 'path';
import type { AwsDeployment } from '../models/deployment/aws.deployment.model.js';
import type { AwsServer } from '../models/server/aws.server.model.js';
import type { S3Storage } from '../resources/s3/storage/s3-storage.resource.js';
import { FileUtility } from '../utilities/file/file.utility.js';

@Module({
  postModelActionHooks: [
    {
      ACTION_NAME: '',
      collectInput: (diff: Diff): string[] => {
        const awsDeployment = diff.model as AwsDeployment;
        const parent = awsDeployment.getParents()['server'][0].to as AwsServer;

        return [
          `input.server.${parent.serverKey}.deployment.${awsDeployment.deploymentTag}.deploymentFolderLocalPath`,
          `input.server.${parent.serverKey}.deployment.${awsDeployment.deploymentTag}.deploymentFolderRemotePath`,
        ];
      },
      handle: async (diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> => {
        const awsDeployment = diff.model as AwsDeployment;
        const parent = awsDeployment.getParents()['server'][0].to as AwsServer;

        const deploymentFolderLocalPath = actionInputs[
          `input.server.${parent.serverKey}.deployment.${awsDeployment.deploymentTag}.deploymentFolderLocalPath`
        ] as string;
        const deploymentFolderRemotePath = actionInputs[
          `input.server.${parent.serverKey}.deployment.${awsDeployment.deploymentTag}.deploymentFolderRemotePath`
        ] as string;
        const s3Storage = actionInputs[`resource.bucket-${awsDeployment.s3StorageService.bucketName}`] as S3Storage;

        // Update manifest with contents of local deployment folder.
        const sourcePaths: { action: 'add'; localPath: string; remotePath: string }[] = [];
        const resolvedDeploymentFolderLocalPath = resolve(deploymentFolderLocalPath);
        const filePaths = await FileUtility.readDirectoryRecursively(resolvedDeploymentFolderLocalPath);
        for (const filePath of filePaths) {
          sourcePaths.push({
            action: 'add',
            localPath: join(resolvedDeploymentFolderLocalPath, filePath),
            remotePath: `${deploymentFolderRemotePath}/${filePath}`,
          });
        }
        s3Storage.updateManifestDiff(
          sourcePaths.reduce((accumulator, currentValue) => {
            accumulator[currentValue.remotePath] = [currentValue.action, currentValue.localPath];
            return accumulator;
          }, {}),
        );

        actionOutputs[s3Storage.resourceId] = s3Storage;
        return actionOutputs;
      },
    },
    {
      ACTION_NAME: '',
      collectInput: (diff: Diff): string[] => {
        const awsDeployment = diff.model as AwsDeployment;

        return [`resource.bucket-${awsDeployment.s3StorageService.bucketName}`];
      },
      handle: async (diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> => {
        const awsDeployment = diff.model as AwsDeployment;

        const s3Storage = actionInputs[`resource.bucket-${awsDeployment.s3StorageService.bucketName}`] as S3Storage;

        // Update manifest with directories to delete.
        const sourcePaths: { action: 'deleteDirectory'; localPath: string; remotePath: string }[] = [];
        sourcePaths.push({
          action: 'deleteDirectory',
          localPath: '',
          remotePath: awsDeployment.deploymentFolderRemotePath,
        });
        s3Storage.updateManifestDiff(
          sourcePaths.reduce((accumulator, currentValue) => {
            accumulator[currentValue.remotePath] = [currentValue.action, currentValue.localPath];
            return accumulator;
          }, {}),
        );

        actionOutputs[s3Storage.resourceId] = s3Storage;
        return actionOutputs;
      },
    },
  ],
})
export class OctoAwsDeploymentModule {}
