import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import type { S3Website } from '../../../../../../resources/s3-website/index.js';
import type { AwsS3StaticWebsiteServiceModule } from '../../../aws-s3-static-website.service.module.js';
import { AwsS3StaticWebsiteService } from '../aws-s3-static-website.service.model.js';

/**
 * @internal
 */
@Action(AwsS3StaticWebsiteService)
export class UpdateSourcePathsS3StaticWebsiteModelAction implements IModelAction<AwsS3StaticWebsiteServiceModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof AwsS3StaticWebsiteService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'sourcePaths'
    );
  }

  async handle(
    diff: Diff<AwsS3StaticWebsiteService>,
    actionInputs: EnhancedModuleSchema<AwsS3StaticWebsiteServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node;

    const s3Website = actionInputs.resources[`bucket-${bucketName}`] as S3Website;
    s3Website.updateManifestDiff(diff.value as S3Website['manifestDiff']);

    actionOutputs[s3Website.resourceId] = s3Website;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<UpdateSourcePathsS3StaticWebsiteModelAction>(UpdateSourcePathsS3StaticWebsiteModelAction)
export class UpdateSourcePathsS3StaticWebsiteModelActionFactory {
  private static instance: UpdateSourcePathsS3StaticWebsiteModelAction;

  static async create(): Promise<UpdateSourcePathsS3StaticWebsiteModelAction> {
    if (!this.instance) {
      this.instance = new UpdateSourcePathsS3StaticWebsiteModelAction();
    }
    return this.instance;
  }
}
