import { AOverlay, Diff, DiffAction, DiffUtility, type IOverlay, Overlay } from '@quadnix/octo';
import type { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';
import type { ISecurityGroupOverlayProperties } from './security-group.overlay.interface.js';

@Overlay()
export class SecurityGroupOverlay extends AOverlay<SecurityGroupOverlay> {
  override readonly MODEL_NAME: string = 'security-group-overlay';

  declare properties: ISecurityGroupOverlayProperties;

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: ISecurityGroupOverlayProperties,
    anchors: SecurityGroupAnchor[],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(previous: SecurityGroupOverlay): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const previousAnchors = previous.getAnchors() as SecurityGroupAnchor[];
    for (const previousAnchor of previousAnchors) {
      const currentAnchor = this.getAnchor(previousAnchor.anchorId, previousAnchor.getParent()) as SecurityGroupAnchor;

      if (previousAnchor.properties.rules.length === 0) {
        if (currentAnchor && currentAnchor.properties.rules.length > 0) {
          diffs.push(new Diff(this, DiffAction.ADD, 'anchor', currentAnchor));
        }
        continue;
      }

      if (!currentAnchor) {
        diffs.push(new Diff(this, DiffAction.DELETE, 'anchor', previousAnchor));
      } else {
        if (currentAnchor.properties.rules.length === 0) {
          diffs.push(new Diff(this, DiffAction.DELETE, 'anchor', previousAnchor));
        } else if (!DiffUtility.isObjectDeepEquals(previousAnchor.properties.rules, currentAnchor.properties.rules)) {
          diffs.push(new Diff(this, DiffAction.UPDATE, 'anchor', currentAnchor));
        }
      }
    }

    const currentAnchors = this.getAnchors() as SecurityGroupAnchor[];
    for (const currentAnchor of currentAnchors) {
      const previousAnchor = previous.getAnchor(
        currentAnchor.anchorId,
        currentAnchor.getParent(),
      ) as SecurityGroupAnchor;
      if (!previousAnchor && currentAnchor.properties.rules.length > 0) {
        diffs.push(new Diff(this, DiffAction.ADD, 'anchor', currentAnchor));
      }
    }

    return diffs;
  }
}
