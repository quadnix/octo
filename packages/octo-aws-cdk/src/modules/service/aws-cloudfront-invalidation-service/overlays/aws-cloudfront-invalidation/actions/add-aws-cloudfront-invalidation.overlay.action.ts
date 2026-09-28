import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  OverlayActionExceptionTransactionError,
  hasNodeName,
} from '@quadnix/octo';
import { CloudFrontInvalidation } from '../../../../../../resources/cloudfront-invalidation/index.js';
import { InvalidationDistributionSchema } from '../../../../../../resources/cloudfront-invalidation/index.schema.js';
import { S3StorageSchema } from '../../../../../../resources/s3-storage/index.schema.js';
import type { AwsCloudFrontInvalidationServiceModule } from '../../../aws-cloudfront-invalidation-service.module.js';
import { AwsCloudFrontInvalidationOverlay } from '../aws-cloudfront-invalidation.overlay.js';

/**
 * @internal
 */
@Action(AwsCloudFrontInvalidationOverlay)
export class AddAwsCloudFrontInvalidationOverlayAction implements IModelAction<AwsCloudFrontInvalidationServiceModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsCloudFrontInvalidationOverlay &&
      hasNodeName(diff.node, 'aws-cloudfront-invalidation-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsCloudFrontInvalidationOverlay>,
    actionInputs: EnhancedModuleSchema<AwsCloudFrontInvalidationServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { awsAccountId, bucketName, contentDigest, distributionName } = diff.node.properties;
    const { cloudFront, source } = actionInputs.inputs;

    // Get the distribution, and the bucket whose files it serves.
    const [matchingCloudFrontDistribution] = await cloudFront.getResourcesMatchingSchema(
      InvalidationDistributionSchema,
      [{ key: 'distributionName', value: distributionName }],
      [],
      { searchBoundaryMembers: false },
    );
    if (!matchingCloudFrontDistribution) {
      throw new OverlayActionExceptionTransactionError(
        `CloudFront distribution "${distributionName}" not found!`,
        diff,
        this.constructor.name,
      );
    }
    const [matchingBucket] = await source.getResourcesMatchingSchema(
      S3StorageSchema,
      [{ key: 'Bucket', value: bucketName }],
      [],
      { searchBoundaryMembers: false },
    );
    if (!matchingBucket) {
      throw new OverlayActionExceptionTransactionError(
        `No S3 storage bucket found for "${bucketName}"!`,
        diff,
        this.constructor.name,
      );
    }

    // Drop what the edges hold whenever the bucket's files change.
    const cloudFrontInvalidation = new CloudFrontInvalidation(
      `cloudfront-invalidation-${distributionName}-${bucketName.replace(/[^\w-]/g, '-')}`,
      { awsAccountId, contentVersion: contentDigest, paths: ['/*'] },
      [matchingCloudFrontDistribution, matchingBucket],
    );
    actionOutputs[cloudFrontInvalidation.resourceId] = cloudFrontInvalidation;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsCloudFrontInvalidationOverlayAction>(AddAwsCloudFrontInvalidationOverlayAction)
export class AddAwsCloudFrontInvalidationOverlayActionFactory {
  private static instance: AddAwsCloudFrontInvalidationOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsCloudFrontInvalidationOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsCloudFrontInvalidationOverlayAction();
    }
    return this.instance;
  }
}
