import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionInputs, ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import type { S3Website } from '../../../../resources/s3/website/s3-website.resource.js';
import { S3StaticWebsiteService } from '../s3-static-website.service.model.js';

@Action(ModelType.MODEL)
export class DeleteS3StaticWebsiteModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteS3StaticWebsiteModelAction';

  collectInput(diff: Diff): string[] {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    return [`resource.bucket-${bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof S3StaticWebsiteService &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const { bucketName } = diff.model as S3StaticWebsiteService;

    const s3Website = actionInputs[`resource.bucket-${bucketName}`] as S3Website;
    s3Website.markDeleted();

    const output: ActionOutputs = {};
    output[s3Website.resourceId] = s3Website;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteS3StaticWebsiteModelAction>(DeleteS3StaticWebsiteModelAction)
export class DeleteS3StaticWebsiteModelActionFactory {
  static async create(): Promise<DeleteS3StaticWebsiteModelAction> {
    return new DeleteS3StaticWebsiteModelAction();
  }
}
