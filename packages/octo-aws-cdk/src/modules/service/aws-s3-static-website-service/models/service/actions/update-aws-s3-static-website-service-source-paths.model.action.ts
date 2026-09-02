import { createHash } from 'crypto';
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
import type { CloudFrontInvalidation } from '../../../../../../resources/cloudfront-invalidation/index.js';
import type { S3Website } from '../../../../../../resources/s3-website/index.js';
import type { AwsS3StaticWebsiteServiceModule } from '../../../aws-s3-static-website-service.module.js';
import { AwsS3StaticWebsiteService, type IManifest } from '../aws-s3-static-website-service.model.js';

/**
 * @internal
 */
@Action(AwsS3StaticWebsiteService)
export class UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction
  implements IModelAction<AwsS3StaticWebsiteServiceModule>
{
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof AwsS3StaticWebsiteService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'sourcePaths'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsS3StaticWebsiteService, IManifest>,
    actionInputs: EnhancedModuleSchema<AwsS3StaticWebsiteServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node;
    const sanitizedBucketName = bucketName.replace(/[^\w-]/g, '-');

    const s3Website = actionInputs.resources[`bucket-${sanitizedBucketName}`] as S3Website;
    s3Website.updateManifest(diff.value);

    actionOutputs[s3Website.resourceId] = s3Website;

    // What the distribution is serving has moved, so the edges have to be told. The version is a
    // digest over the manifest rather than the manifest itself: it only ever has to differ from the
    // last one, and an invalidation that named every file would be billed per path.
    const cloudFrontInvalidation = actionInputs.resources[`cloudfront-invalidation-${sanitizedBucketName}`] as
      | CloudFrontInvalidation
      | undefined;
    if (cloudFrontInvalidation) {
      const manifestDigest = createHash('sha1')
        .update(
          Object.keys(diff.value)
            .sort()
            .map((remotePath) => `${remotePath}:${diff.value[remotePath].digest}`)
            .join('\n'),
        )
        .digest('hex');
      cloudFrontInvalidation.properties.contentVersion = manifestDigest;

      actionOutputs[cloudFrontInvalidation.resourceId] = cloudFrontInvalidation;
    }

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction>(UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction)
export class UpdateAwsS3StaticWebsiteServiceSourcePathsModelActionFactory {
  private static instance: UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction;

  /**
   * @internal
   */
  static async create(): Promise<UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction> {
    if (!this.instance) {
      this.instance = new UpdateAwsS3StaticWebsiteServiceSourcePathsModelAction();
    }
    return this.instance;
  }
}
