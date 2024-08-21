import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  NodeType,
} from '@quadnix/octo';
import type { S3Website } from '../../../../resources/s3/website/s3-website.resource.js';
import { S3StaticWebsiteService } from '../s3-static-website.service.model.js';

@Action(NodeType.MODEL)
export class UpdateSourcePathsS3StaticWebsiteModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateSourcePathsS3StaticWebsiteModelAction';

  collectInput(diff: Diff): string[] {
    const { bucketName } = diff.node as S3StaticWebsiteService;

    return [`resource.bucket-${bucketName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof S3StaticWebsiteService &&
      diff.node.NODE_NAME === 'service' &&
      diff.field === 'sourcePaths'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const { bucketName } = diff.node as S3StaticWebsiteService;

    const s3Website = actionInputs[`resource.bucket-${bucketName}`] as S3Website;
    s3Website.updateManifestDiff(diff.value as S3Website['manifestDiff']);
    actionOutputs[s3Website.resourceId] = s3Website;

    return actionOutputs;
  }
}

@Factory<UpdateSourcePathsS3StaticWebsiteModelAction>(UpdateSourcePathsS3StaticWebsiteModelAction)
export class UpdateSourcePathsS3StaticWebsiteModelActionFactory {
  static async create(): Promise<UpdateSourcePathsS3StaticWebsiteModelAction> {
    return new UpdateSourcePathsS3StaticWebsiteModelAction();
  }
}
