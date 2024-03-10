import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { S3Storage } from '../../../resources/s3/storage/s3-storage.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsDeployment } from '../aws.deployment.model.js';

@Action(ModelType.MODEL)
export class DeleteDeploymentModelAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteDeploymentModelAction';

  override collectInput(diff: Diff): string[] {
    const awsDeployment = diff.model as AwsDeployment;

    return [`resource.bucket-${awsDeployment.s3StorageService.bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'deployment' && diff.field === 'deploymentTag'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
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

    const output: ActionOutputs = {};
    output[s3Storage.resourceId] = s3Storage;

    return output;
  }
}

@Factory<DeleteDeploymentModelAction>(DeleteDeploymentModelAction)
export class DeleteDeploymentModelActionFactory {
  static async create(): Promise<DeleteDeploymentModelAction> {
    return new DeleteDeploymentModelAction();
  }
}
