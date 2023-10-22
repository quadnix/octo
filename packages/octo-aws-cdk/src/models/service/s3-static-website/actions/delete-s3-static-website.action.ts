import { Diff, DiffAction, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { S3Website } from '../../../../resources/s3/website/s3-website.resource.js';
import { Action } from '../../../action.abstract.js';
import { S3StaticWebsiteService } from '../s3-static-website.service.model.js';

export class DeleteS3StaticWebsiteAction extends Action {
  readonly ACTION_NAME: string = 'DeleteS3StaticWebsiteAction';

  override collectInput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    return [`resource.bucket-${bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId' &&
      (diff.model as S3StaticWebsiteService).serviceId.endsWith('s3-static-website')
    );
  }

  handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    const s3Website = actionInputs[`resource.bucket-${bucketName}`] as S3Website;

    // Delete S3 Website.
    s3Website.markDeleted();

    return {};
  }

  override async postTransaction(diff: Diff): Promise<void> {
    const model = diff.model as S3StaticWebsiteService;
    await model.saveSourceManifest();
  }
}
