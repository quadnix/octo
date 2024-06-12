import { AOverlay, Diff, DiffAction, DiffUtility, type IOverlay, Overlay } from '@quadnix/octo';
import type { EcsServiceAnchor } from '../../anchors/ecs-service.anchor.js';
import type { EnvironmentVariablesAnchor } from '../../anchors/environment-variables.anchor.js';
import type { IamRoleAnchor } from '../../anchors/iam-role.anchor.js';
import type { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../anchors/subnet-filesystem-mount.anchor.js';
import { TaskDefinitionAnchor } from '../../anchors/task-definition.anchor.js';
import type { IExecutionOverlayProperties } from './execution.overlay.interface.js';

@Overlay()
export class ExecutionOverlay extends AOverlay<ExecutionOverlay> {
  override readonly MODEL_NAME: string = 'execution-overlay';

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

  override async diff(previous: ExecutionOverlay): Promise<Diff[]> {
    const diffs: Diff[] = [];

    // Generate diff of TaskDefinitionAnchor.
    const previousTaskDefinitionAnchor = previous
      .getAnchors()
      .find((a) => a instanceof TaskDefinitionAnchor) as TaskDefinitionAnchor;
    const currentTaskDefinitionAnchor = this.getAnchors().find(
      (a) => a instanceof TaskDefinitionAnchor,
    ) as TaskDefinitionAnchor;
    if (
      !DiffUtility.isObjectDeepEquals(previousTaskDefinitionAnchor.properties, currentTaskDefinitionAnchor.properties)
    ) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'overlayId', ''));
    }

    // Generate diff when new SubnetFilesystemMountAnchor is added or removed.
    const previousSubnetFilesystemMountAnchors = previous
      .getAnchors()
      .filter((a) => a instanceof SubnetFilesystemMountAnchor);
    const currentSubnetFilesystemMountAnchors = this.getAnchors().filter(
      (a) => a instanceof SubnetFilesystemMountAnchor,
    );
    for (const previousSubnetFilesystemMountAnchor of previousSubnetFilesystemMountAnchors) {
      if (!this.getAnchor(previousSubnetFilesystemMountAnchor.anchorId)) {
        diffs.push(new Diff(this, DiffAction.UPDATE, 'overlayId', ''));
      }
    }
    for (const currentSubnetFilesystemMountAnchor of currentSubnetFilesystemMountAnchors) {
      if (!previous.getAnchor(currentSubnetFilesystemMountAnchor.anchorId)) {
        diffs.push(new Diff(this, DiffAction.UPDATE, 'overlayId', ''));
      }
    }

    return diffs;
  }
}
