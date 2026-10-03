import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { AwsSecurityGroupAnchor } from '../../../../../anchors/aws-security-group/aws-security-group.anchor.js';
import type { AwsSecurityGroupAnchorSchema } from '../../../../../anchors/aws-security-group/aws-security-group.anchor.schema.js';
import { AwsEcsExecutionServerSecurityGroupOverlaySchema } from './aws-ecs-execution-server-security-group.schema.js';

/**
 * @internal
 */
@Overlay('@octo', 'aws-ecs-execution-server-security-group-overlay', AwsEcsExecutionServerSecurityGroupOverlaySchema)
export class AwsEcsExecutionServerSecurityGroupOverlay extends AOverlay<
  AwsEcsExecutionServerSecurityGroupOverlaySchema,
  AwsEcsExecutionServerSecurityGroupOverlay
> {
  declare anchors: [
    AwsSecurityGroupAnchor,
    MatchingAnchor<AwsSecurityGroupAnchorSchema>,
    ...MatchingAnchor<AwsSecurityGroupAnchorSchema>[],
  ];
  declare properties: AwsEcsExecutionServerSecurityGroupOverlaySchema['properties'];

  /**
   * @internal
   */
  constructor(
    overlayId: string,
    properties: AwsEcsExecutionServerSecurityGroupOverlaySchema['properties'],
    anchors: [
      AwsSecurityGroupAnchor,
      MatchingAnchor<AwsSecurityGroupAnchorSchema>,
      ...MatchingAnchor<AwsSecurityGroupAnchorSchema>[],
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
