import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsDynamoDBAnchorSchema } from '../../../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsEcrImageAnchorSchema } from '../../../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import type { AwsServerlessEnvironmentAnchorSchema } from '../../../../../anchors/aws-environment/aws-serverless-environment.anchor.schema.js';
import type { AwsLambdaExecutionAnchor } from '../../../../../anchors/aws-lambda/aws-lambda-execution.anchor.js';
import type { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import type { AwsServerAnchorSchema } from '../../../../../anchors/aws-server/aws-server.anchor.schema.js';
import { AwsLambdaExecutionOverlaySchema } from './aws-lambda-execution.schema.js';

/**
 * Joins an execution to its environment, and to the image, buckets and tables its code uses. Its
 * action creates the IAM role and the Lambda function.
 *
 * @internal
 */
@Overlay('@octo', 'aws-lambda-execution-overlay', AwsLambdaExecutionOverlaySchema)
export class AwsLambdaExecutionOverlay extends AOverlay<AwsLambdaExecutionOverlaySchema, AwsLambdaExecutionOverlay> {
  declare anchors: [
    AwsLambdaExecutionAnchor,
    MatchingAnchor<AwsServerlessEnvironmentAnchorSchema>,
    MatchingAnchor<AwsServerAnchorSchema>,
    MatchingAnchor<AwsEcrImageAnchorSchema>,
    ...(MatchingAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema> | MatchingAnchor<AwsDynamoDBAnchorSchema>)[],
  ];
  declare properties: AwsLambdaExecutionOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsLambdaExecutionOverlaySchema['properties'],
    anchors: [
      AwsLambdaExecutionAnchor,
      MatchingAnchor<AwsServerlessEnvironmentAnchorSchema>,
      MatchingAnchor<AwsServerAnchorSchema>,
      MatchingAnchor<AwsEcrImageAnchorSchema>,
      ...(MatchingAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema> | MatchingAnchor<AwsDynamoDBAnchorSchema>)[],
    ],
  ) {
    super(overlayId, properties, anchors);
  }

  /**
   * @internal
   */
  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
