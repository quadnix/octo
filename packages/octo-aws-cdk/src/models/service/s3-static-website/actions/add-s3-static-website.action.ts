import { Action, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { S3Website } from '../../../../resources/s3/website/s3-website.resource.js';
import { AAction } from '../../../action.abstract.js';
import { S3StaticWebsiteService } from '../s3-static-website.service.model.js';

@Action(ModelType.MODEL)
export class AddS3StaticWebsiteAction extends AAction {
  readonly ACTION_NAME: string = 'AddS3StaticWebsiteAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId' &&
      (diff.model as S3StaticWebsiteService).serviceId.endsWith('s3-static-website')
    );
  }

  async handle(diff: Diff): Promise<ActionOutputs> {
    const { awsRegionId, bucketName } = diff.model as S3StaticWebsiteService;

    // Create S3 Website.
    const s3Website = new S3Website(`bucket-${bucketName}`, {
      awsRegionId,
      Bucket: bucketName,
      ErrorDocument: 'error.html',
      IndexDocument: 'index.html',
    });

    const output: ActionOutputs = {};
    output[s3Website.resourceId] = s3Website;

    return output;
  }

  override async postTransaction(diff: Diff): Promise<void> {
    const model = diff.model as S3StaticWebsiteService;
    await model.saveSourceManifest();
  }
}

@Factory<AddS3StaticWebsiteAction>(AddS3StaticWebsiteAction)
export class AddS3StaticWebsiteActionFactory {
  static async create(): Promise<AddS3StaticWebsiteAction> {
    return new AddS3StaticWebsiteAction();
  }
}
