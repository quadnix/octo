import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  type Diff,
  DiffAction,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import type { SecurityGroupAnchor } from '../../../anchors/security-group.anchor.js';
import { SecurityGroup } from '../../../resources/security-group/index.js';
import type { Vpc } from '../../../resources/vpc/index.js';
import { SecurityGroupOverlay } from '../security-group.overlay.js';

@Action(SecurityGroupOverlay)
export class AddSecurityGroupOverlayAction implements IModelAction {
  collectInput(diff: Diff): string[] {
    const securityGroupOverlay = diff.node as SecurityGroupOverlay;
    const properties = securityGroupOverlay.properties;

    return [`resource.vpc-${properties.regionId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof SecurityGroupOverlay &&
      (diff.node.constructor as typeof SecurityGroupOverlay).NODE_NAME === 'security-group-overlay' &&
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
          rules: anchor.properties.rules.map((rule) => ({
            CidrBlock: rule.CidrBlock,
            Egress: rule.Egress,
            FromPort: rule.FromPort,
            IpProtocol: rule.IpProtocol,
            ToPort: rule.ToPort,
          })),
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
