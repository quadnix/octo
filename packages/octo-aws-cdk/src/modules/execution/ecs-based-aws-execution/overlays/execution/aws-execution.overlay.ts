import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { EcsClusterAnchorSchema } from '../../../../../anchors/ecs-cluster/ecs-cluster.anchor.schema.js';
import type { EcsExecutionAnchor } from '../../../../../anchors/ecs-execution/ecs-execution.anchor.js';
import type { EcsServiceAnchor } from '../../../../../anchors/ecs-service/ecs-service.anchor.js';
import type { EcsTaskDefinitionAnchorSchema } from '../../../../../anchors/ecs-task-definition/ecs-task-definition.anchor.schema.js';
import type { IamRoleAnchorSchema } from '../../../../../anchors/iam-role/iam-role.anchor.schema.js';
import type { SecurityGroupAnchor } from '../../../../../anchors/security-group/security-group.anchor.js';
import type { SecurityGroupAnchorSchema } from '../../../../../anchors/security-group/security-group.anchor.schema.js';
import type { SubnetLocalFilesystemMountAnchorSchema } from '../../../../../anchors/subnet-local-filesystem-mount/subnet-local-filesystem-mount.anchor.schema.js';
import { AwsExecutionOverlaySchema } from './aws-execution.schema.js';

@Overlay('@octo', 'execution-overlay', AwsExecutionOverlaySchema)
export class AwsExecutionOverlay extends AOverlay<AwsExecutionOverlaySchema, AwsExecutionOverlay> {
  declare anchors: [
    MatchingAnchor<IamRoleAnchorSchema>,
    MatchingAnchor<EcsTaskDefinitionAnchorSchema>,
    EcsServiceAnchor,
    EcsExecutionAnchor,
    MatchingAnchor<EcsClusterAnchorSchema>,
    SecurityGroupAnchor,
    MatchingAnchor<SecurityGroupAnchorSchema>,
    ...MatchingAnchor<SubnetLocalFilesystemMountAnchorSchema>[],
  ];
  declare properties: AwsExecutionOverlaySchema['properties'];

  constructor(
    overlayId: string,
    properties: AwsExecutionOverlaySchema['properties'],
    anchors: [
      MatchingAnchor<IamRoleAnchorSchema>,
      MatchingAnchor<EcsTaskDefinitionAnchorSchema>,
      EcsServiceAnchor,
      EcsExecutionAnchor,
      MatchingAnchor<EcsClusterAnchorSchema>,
      SecurityGroupAnchor,
      MatchingAnchor<SecurityGroupAnchorSchema>,
      ...MatchingAnchor<SubnetLocalFilesystemMountAnchorSchema>[],
    ],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
