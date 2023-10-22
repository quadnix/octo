import { Diff, DiffAction, IActionOutputs } from '@quadnix/octo';
import { S3Website } from '../../../../resources/s3/website/s3-website.resource.js';
import { Action } from '../../../action.abstract.js';
import { S3StaticWebsiteService } from '../s3-static-website.service.model.js';

export class AddS3StaticWebsiteAction extends Action {
  readonly ACTION_NAME: string = 'AddS3StaticWebsiteAction';

  override collectOutput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    return [`bucket-${bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId' &&
      (diff.model as S3StaticWebsiteService).serviceId.endsWith('s3-static-website')
    );
  }

  handle(diff: Diff): IActionOutputs {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    // Create S3 Website.
    const s3Website = new S3Website(`bucket-${bucketName}`, {
      Bucket: bucketName,
      ErrorDocument: 'error.html',
      IndexDocument: 'index.html',
    });

    const output: IActionOutputs = {};
    output[s3Website.resourceId] = s3Website;

    return output;
  }

  override async postTransaction(diff: Diff): Promise<void> {
    const model = diff.model as S3StaticWebsiteService;
    await model.saveSourceManifest();
  }
}
