import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { lstat, readdir } from 'fs/promises';
import { join, parse, resolve } from 'path';
import { S3Storage } from '../../../resources/s3/storage/s3-storage.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsServer } from '../../server/aws.server.model.js';
import { AwsDeployment } from '../aws.deployment.model.js';

@Action(ModelType.MODEL)
export class AddDeploymentModelAction extends AAction {
  readonly ACTION_NAME: string = 'AddDeploymentModelAction';

  override collectInput(diff: Diff): string[] {
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

    // Ensure deploymentFolderLocalPath exists, and is readable.
    const resolvedDeploymentFolderLocalPath = resolve(deploymentFolderLocalPath);
    const stats = await lstat(resolvedDeploymentFolderLocalPath);

    // Update manifest with contents of local deployment folder.
    const sourcePaths: { action: 'add'; localPath: string; remotePath: string }[] = [];
    if (stats.isFile()) {
      const fileName = parse(resolvedDeploymentFolderLocalPath).base;
      sourcePaths.push({
        action: 'add',
        localPath: resolvedDeploymentFolderLocalPath,
        remotePath: `${awsDeployment.deploymentFolderRemotePath}/${fileName}`,
      });
    } else {
      const filePaths = await readdir(resolvedDeploymentFolderLocalPath);
      for (const filePath of filePaths) {
        sourcePaths.push({
          action: 'add',
          localPath: join(resolvedDeploymentFolderLocalPath, filePath),
          remotePath: `${awsDeployment.deploymentFolderRemotePath}/${filePath}`,
        });
      }
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
}

@Factory<AddDeploymentModelAction>(AddDeploymentModelAction)
export class AddDeploymentModelActionFactory {
  static async create(): Promise<AddDeploymentModelAction> {
    return new AddDeploymentModelAction();
  }
}
