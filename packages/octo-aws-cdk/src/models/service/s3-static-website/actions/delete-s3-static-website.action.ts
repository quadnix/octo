import { Diff, DiffAction, IAction, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { S3Website } from '../../../../resources/s3/website/s3-website.resource';
import { S3StaticWebsiteService } from '../s3-static-website.service.model';

export class DeleteS3StaticWebsiteAction implements IAction<IActionInputs, IActionOutputs> {
  readonly ACTION_NAME: string = 'DeleteS3StaticWebsiteAction';

  collectInput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    return [`resource.${bucketName}`];
  }

  collectOutput(): string[] {
    return [];
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

    const s3Website = actionInputs[`resource.${bucketName}`] as S3Website;

    // Delete S3 Website.
    s3Website.diffMarkers.delete = true;

    return {};
  }

  revert(): IActionOutputs {
    return {};
  }
}
