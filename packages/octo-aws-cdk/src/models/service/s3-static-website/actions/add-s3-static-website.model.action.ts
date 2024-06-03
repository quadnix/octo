import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import { S3Website } from '../../../../resources/s3/website/s3-website.resource.js';
import { S3StaticWebsiteService } from '../s3-static-website.service.model.js';

@Action(ModelType.MODEL)
export class AddS3StaticWebsiteModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddS3StaticWebsiteModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof S3StaticWebsiteService &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId'
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

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddS3StaticWebsiteModelAction>(AddS3StaticWebsiteModelAction)
export class AddS3StaticWebsiteModelActionFactory {
  static async create(): Promise<AddS3StaticWebsiteModelAction> {
    return new AddS3StaticWebsiteModelAction();
  }
}
