import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingResource,
  OverlayActionExceptionTransactionError,
  hasNodeName,
} from '@quadnix/octo';
import { AwsS3StorageServiceAnchorSchema } from '../../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import type { CloudFrontDistribution } from '../../../../../../resources/cloudfront-distribution/index.js';
import type { S3Storage } from '../../../../../../resources/s3-storage/index.js';
import { S3StorageSchema } from '../../../../../../resources/s3-storage/index.schema.js';
import type { AwsCloudFrontServiceModule } from '../../../aws-cloudfront-service.module.js';
import { AwsCloudFrontOriginOverlay } from '../aws-cloudfront-origin.overlay.js';

/**
 * @internal
 */
@Action(AwsCloudFrontOriginOverlay)
export class AddAwsCloudFrontOriginOverlayAction implements IModelAction<AwsCloudFrontServiceModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsCloudFrontOriginOverlay &&
      hasNodeName(diff.node, 'aws-cloudfront-origin-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsCloudFrontOriginOverlay>,
    actionInputs: EnhancedModuleSchema<AwsCloudFrontServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { bucketName } = diff.node.properties;
    const { distributionName, origins } = actionInputs.inputs;

    const cloudFrontDistribution = actionInputs.resources[`cloudfront-${distributionName}`] as CloudFrontDistribution;
    const matchingCloudFrontDistribution = new MatchingResource(cloudFrontDistribution);

    // Find the bucket this overlay serves.
    let matchingBucket: MatchingResource<S3StorageSchema> | undefined;
    for (const { source } of origins) {
      const [matchingAnchor] = await source.getAnchorsMatchingSchema(AwsS3StorageServiceAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      if (matchingAnchor.getSchemaInstance().properties.bucketName !== bucketName) {
        continue;
      }

      [matchingBucket] = await source.getResourcesMatchingSchema(
        S3StorageSchema,
        [{ key: 'Bucket', value: bucketName }],
        [],
        { searchBoundaryMembers: false },
      );
      break;
    }
    if (!matchingBucket) {
      throw new OverlayActionExceptionTransactionError(
        `No S3 storage bucket found for "${bucketName}"!`,
        diff,
        this.constructor.name,
      );
    }

    // Grant the distribution access to the bucket.
    const s3Storage = matchingBucket.getActual() as S3Storage;
    s3Storage.addPermission(matchingCloudFrontDistribution, '', {
      allowRead: true,
      allowWrite: false,
      principalType: 'cloudfront',
    });
    actionOutputs[s3Storage.resourceId] = s3Storage;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsCloudFrontOriginOverlayAction>(AddAwsCloudFrontOriginOverlayAction)
export class AddAwsCloudFrontOriginOverlayActionFactory {
  private static instance: AddAwsCloudFrontOriginOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsCloudFrontOriginOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsCloudFrontOriginOverlayAction();
    }
    return this.instance;
  }
}
