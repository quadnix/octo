import { Diff, DiffAction, IAction, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { S3Website } from '../../../../resources/s3/website/s3-website.resource';
import { S3StaticWebsiteService } from '../s3-static-website.service.model';

export class AddS3StaticWebsiteAction implements IAction<IActionInputs, IActionOutputs> {
  readonly ACTION_NAME: string = 'AddS3StaticWebsiteAction';

  collectInput(): string[] {
    return [];
  }

  collectOutput(diff: Diff): string[] {
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

  revert(): IActionOutputs {
    return {};
  }
}
