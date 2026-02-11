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
import type { AwsS3StaticWebsiteServiceModule } from '../../../aws-s3-static-website-service.module.js';
import { AwsS3StaticWebsiteService, type S3WebsiteManifestDiff } from '../aws-s3-static-website-service.model.js';

/**
 * @internal
 */
@Action(AwsS3StaticWebsiteService)
export class UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction
  implements IModelAction<AwsS3StaticWebsiteServiceModule>
{
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof AwsS3StaticWebsiteService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'sourcePaths'
    );
  }

  async handle(
    diff: Diff<AwsS3StaticWebsiteService, S3WebsiteManifestDiff>,
    actionInputs: EnhancedModuleSchema<AwsS3StaticWebsiteServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node;

    const s3Website = actionInputs.resources[`bucket-${bucketName.replace(/[^\w-]/g, '-')}`] as S3Website;
    s3Website.updateManifestDiff(diff.value);

    actionOutputs[s3Website.resourceId] = s3Website;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction>(UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction)
export class UpdateAwsS3StaticWebsiteServiceSourcePathsModelActionFactory {
  private static instance: UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction;

  static async create(): Promise<UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction> {
    if (!this.instance) {
      this.instance = new UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction();
    }
    return this.instance;
  }
}
