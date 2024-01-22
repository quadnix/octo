import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { S3Website } from '../../../../resources/s3/website/s3-website.resource.js';
import { AAction } from '../../../action.abstract.js';
import { S3StaticWebsiteService } from '../s3-static-website.service.model.js';

@Action(ModelType.MODEL)
export class UpdateSourcePathsS3StaticWebsiteModelAction extends AAction {
  readonly ACTION_NAME: string = 'UpdateSourcePathsS3StaticWebsiteModelAction';

  override collectInput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    return [`resource.bucket-${bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'sourcePaths' &&
      (diff.model as S3StaticWebsiteService).serviceId.endsWith('s3-static-website')
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    const s3Website = actionInputs[`resource.bucket-${bucketName}`] as S3Website;
    s3Website.updateManifestDiff(diff.value as S3Website['manifestDiff']);

    const output: ActionOutputs = {};
    output[s3Website.resourceId] = s3Website;

    return output;
  }

  override async postTransaction(diff: Diff): Promise<void> {
    const model = diff.model as S3StaticWebsiteService;
    await model.saveSourceManifest();
  }
}

@Factory<UpdateSourcePathsS3StaticWebsiteModelAction>(UpdateSourcePathsS3StaticWebsiteModelAction)
export class UpdateSourcePathsS3StaticWebsiteModelActionFactory {
  static async create(): Promise<UpdateSourcePathsS3StaticWebsiteModelAction> {
    return new UpdateSourcePathsS3StaticWebsiteModelAction();
  }
}
