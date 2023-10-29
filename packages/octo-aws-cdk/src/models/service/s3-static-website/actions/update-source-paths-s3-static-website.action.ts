import { Diff, DiffAction, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { SharedS3Website } from '../../../../resources/s3/website/s3-website.shared-resource.js';
import { Action } from '../../../action.abstract.js';
import { S3StaticWebsiteService } from '../s3-static-website.service.model.js';

export class UpdateSourcePathsS3StaticWebsiteAction extends Action {
  readonly ACTION_NAME: string = 'UpdateSourcePathsS3StaticWebsiteAction';

  override collectInput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    return [`resource.bucket-${bucketName}`];
  }

  override collectOutput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    return [`bucket-${bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'sourcePaths' &&
      (diff.model as S3StaticWebsiteService).serviceId.endsWith('s3-static-website')
    );
  }

  handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    const sharedS3Website = actionInputs[`resource.bucket-${bucketName}`] as SharedS3Website;
    sharedS3Website.markUpdated('update-source-paths', diff.value);

    const output: IActionOutputs = {};
    output[sharedS3Website.resourceId] = sharedS3Website;

    return output;
  }

  override async postTransaction(diff: Diff): Promise<void> {
    const model = diff.model as S3StaticWebsiteService;
    await model.saveSourceManifest();
  }
}
