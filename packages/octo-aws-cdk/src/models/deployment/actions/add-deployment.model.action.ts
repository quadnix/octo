import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionInputs, ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import { join, resolve } from 'path';
import type { S3Storage } from '../../../resources/s3/storage/s3-storage.resource.js';
import { FileUtility } from '../../../utilities/file/file.utility.js';
import type { AwsServer } from '../../server/aws.server.model.js';
import type { AwsDeployment } from '../aws.deployment.model.js';

@Action(ModelType.MODEL)
export class AddDeploymentModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddDeploymentModelAction';

  collectInput(diff: Diff): string[] {
    const awsDeployment = diff.model as AwsDeployment;

    const parents = awsDeployment.getParents();
    const parent = (parents['server'] || parents['support'])[0].to as AwsServer;

    return [
      `input.server.${parent.serverKey}.deployment.${awsDeployment.deploymentTag}.deploymentFolderLocalPath`,
      `resource.bucket-${awsDeployment.s3StorageService.bucketName}`,
    ];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'deployment' && diff.field === 'deploymentTag';
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const awsDeployment = diff.model as AwsDeployment;

    const parents = awsDeployment.getParents();
    const parent = (parents['server'] || parents['support'])[0].to as AwsServer;

    const deploymentFolderLocalPath = actionInputs[
      `input.server.${parent.serverKey}.deployment.${awsDeployment.deploymentTag}.deploymentFolderLocalPath`
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
        remotePath: `${awsDeployment.deploymentFolderRemotePath}/${filePath}`,
      });
    }
    s3Storage.updateManifestDiff(
      sourcePaths.reduce((accumulator, currentValue) => {
        accumulator[currentValue.remotePath] = [currentValue.action, currentValue.localPath];
        return accumulator;
      }, {}),
    );

    const output: ActionOutputs = {};
    output[s3Storage.resourceId] = s3Storage;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddDeploymentModelAction>(AddDeploymentModelAction)
export class AddDeploymentModelActionFactory {
  static async create(): Promise<AddDeploymentModelAction> {
    return new AddDeploymentModelAction();
  }
}
