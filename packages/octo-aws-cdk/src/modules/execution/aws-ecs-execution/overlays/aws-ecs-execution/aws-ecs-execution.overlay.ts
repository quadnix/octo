import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsEcsClusterAnchorSchema } from '../../../../../anchors/aws-ecs/aws-ecs-cluster.anchor.schema.js';
import type { AwsEcsExecutionAnchor } from '../../../../../anchors/aws-ecs/aws-ecs-execution.anchor.js';
import type { AwsIamRoleAnchorSchema } from '../../../../../anchors/aws-iam/aws-iam-role.anchor.schema.js';
import type { AwsSecurityGroupAnchor } from '../../../../../anchors/aws-security-group/aws-security-group.anchor.js';
import type { AwsSubnetLocalFilesystemMountAnchorSchema } from '../../../../../anchors/aws-subnet/aws-subnet-local-filesystem-mount.anchor.schema.js';
import { AwsEcsExecutionOverlaySchema } from './aws-ecs-execution.schema.js';

/**
 * @internal
 */
@Overlay('@octo', 'aws-ecs-execution-overlay', AwsEcsExecutionOverlaySchema)
export class AwsEcsExecutionOverlay extends AOverlay<AwsEcsExecutionOverlaySchema, AwsEcsExecutionOverlay> {
  declare anchors: [
    MatchingAnchor<AwsIamRoleAnchorSchema>,
    AwsEcsExecutionAnchor,
    MatchingAnchor<AwsEcsClusterAnchorSchema>,
    AwsSecurityGroupAnchor,
    ...MatchingAnchor<AwsSubnetLocalFilesystemMountAnchorSchema>[],
  ];
  declare properties: AwsEcsExecutionOverlaySchema['properties'];

  constructor(
    overlayId: string,
    properties: AwsEcsExecutionOverlaySchema['properties'],
    anchors: [
      MatchingAnchor<AwsIamRoleAnchorSchema>,
      AwsEcsExecutionAnchor,
      MatchingAnchor<AwsEcsClusterAnchorSchema>,
      AwsSecurityGroupAnchor,
      ...MatchingAnchor<AwsSubnetLocalFilesystemMountAnchorSchema>[],
    ],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
