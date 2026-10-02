import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsDynamoDBAnchorSchema } from '../../../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import type { AwsEcrImageAnchorSchema } from '../../../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import type { AwsEcsClusterAnchorSchema } from '../../../../../anchors/aws-ecs/aws-ecs-cluster.anchor.schema.js';
import type { AwsEcsExecutionAnchor } from '../../../../../anchors/aws-ecs/aws-ecs-execution.anchor.js';
import type { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import type { AwsSecurityGroupAnchor } from '../../../../../anchors/aws-security-group/aws-security-group.anchor.js';
import type { AwsSubnetLocalFilesystemMountAnchorSchema } from '../../../../../anchors/aws-subnet/aws-subnet-local-filesystem-mount.anchor.schema.js';
import { AwsEcsExecutionOverlaySchema } from './aws-ecs-execution.schema.js';

/**
 * Joins an execution to its cluster and security group, and to every filesystem mount, granted bucket
 * prefix and table, and published image it uses. Its action creates the IAM role, the task definition,
 * and the service.
 *
 * @internal
 */
@Overlay('@octo', 'aws-ecs-execution-overlay', AwsEcsExecutionOverlaySchema)
export class AwsEcsExecutionOverlay extends AOverlay<AwsEcsExecutionOverlaySchema, AwsEcsExecutionOverlay> {
  declare anchors: [
    AwsEcsExecutionAnchor,
    MatchingAnchor<AwsEcsClusterAnchorSchema>,
    AwsSecurityGroupAnchor,
    ...(
      | MatchingAnchor<AwsSubnetLocalFilesystemMountAnchorSchema>
      | MatchingAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema>
      | MatchingAnchor<AwsDynamoDBAnchorSchema>
      | MatchingAnchor<AwsEcrImageAnchorSchema>
    )[],
  ];
  declare properties: AwsEcsExecutionOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsEcsExecutionOverlaySchema['properties'],
    anchors: [
      AwsEcsExecutionAnchor,
      MatchingAnchor<AwsEcsClusterAnchorSchema>,
      AwsSecurityGroupAnchor,
      ...(
        | MatchingAnchor<AwsSubnetLocalFilesystemMountAnchorSchema>
        | MatchingAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema>
        | MatchingAnchor<AwsDynamoDBAnchorSchema>
        | MatchingAnchor<AwsEcrImageAnchorSchema>
      )[],
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
