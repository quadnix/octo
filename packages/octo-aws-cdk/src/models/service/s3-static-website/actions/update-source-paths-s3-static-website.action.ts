import { Diff, DiffAction, IAction, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { S3Website } from '../../../../resources/s3/website/s3-website.resource';
import { S3StaticWebsiteService } from '../s3-static-website.service.model';

export class UpdateSourcePathsS3StaticWebsiteAction implements IAction<IActionInputs, IActionOutputs> {
  readonly ACTION_NAME: string = 'UpdateSourcePathsS3StaticWebsiteAction';

  collectInput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    return [`resource.${bucketName}`];
  }

  collectOutput(): string[] {
    return [];
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

    const s3Website = actionInputs[`resource.${bucketName}`] as S3Website;

    // Update website source paths.
    s3Website.diffMarkers.update = { key: 'update-source-paths', value: diff.value };

    return {};
  }

  revert(): IActionOutputs {
    return {};
  }
}
