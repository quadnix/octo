import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  NodeType,
} from '@quadnix/octo';
import type { SecurityGroupAnchor } from '../../../anchors/security-group.anchor.js';
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import type { Vpc } from '../../../resources/vpc/vpc.resource.js';
import { SecurityGroupOverlay } from '../security-group.overlay.js';

@Action(NodeType.OVERLAY)
export class AddSecurityGroupOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddSecurityGroupOverlayAction';

  collectInput(diff: Diff): string[] {
    const securityGroupOverlay = diff.node as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties;

    return [`resource.vpc-${properties.regionId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof SecurityGroupOverlay &&
      diff.node.NODE_NAME === 'security-group-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const securityGroupOverlay = diff.node as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties;
    const anchors = securityGroupOverlay.getAnchors() as SecurityGroupAnchor[];

    const vpc = actionInputs[`resource.vpc-${properties.regionId}`] as Vpc;

    for (const anchor of anchors) {
      if (anchor.properties.rules.length === 0) {
        continue;
      }

      const securityGroup = new SecurityGroup(
        `sec-grp-${anchor.properties.securityGroupName}`,
        {
          awsRegionId: properties.awsRegionId,
          rules: anchor.properties.rules,
        },
        [vpc],
      );
      actionOutputs[securityGroup.resourceId] = securityGroup;
    }

    return actionOutputs;
  }
}

@Factory<AddSecurityGroupOverlayAction>(AddSecurityGroupOverlayAction)
export class AddSecurityGroupOverlayActionFactory {
  static async create(): Promise<AddSecurityGroupOverlayAction> {
    return new AddSecurityGroupOverlayAction();
  }
}
