import { AOverlay, type IOverlay, Overlay } from '@quadnix/octo';
import { EcsServiceAnchor } from '../../anchors/ecs-service.anchor.js';
import type { EnvironmentVariablesAnchor } from '../../anchors/environment-variables.anchor.js';
import type { IamRoleAnchor } from '../../anchors/iam-role.anchor.js';
import { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../anchors/subnet-filesystem-mount.anchor.js';
import { TaskDefinitionAnchor } from '../../anchors/task-definition.anchor.js';
import type { IExecutionOverlayProperties } from './execution.overlay.interface.js';

@Overlay()
export class ExecutionOverlay extends AOverlay<ExecutionOverlay> {
  override readonly NODE_NAME: string = 'execution-overlay';

  declare properties: IExecutionOverlayProperties;

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: IExecutionOverlayProperties,
    anchors: [
      IamRoleAnchor,
      TaskDefinitionAnchor,
      EcsServiceAnchor,
      EnvironmentVariablesAnchor, // Execution Environment Variables Anchor
      EnvironmentVariablesAnchor, // Environment Environment Variables Anchor
      SecurityGroupAnchor, // Execution Security Group Anchor
      SecurityGroupAnchor, // Server Security Group Anchor
      ...SubnetFilesystemMountAnchor[],
    ],
  ) {
    super(overlayId, properties, anchors);
  }
}
