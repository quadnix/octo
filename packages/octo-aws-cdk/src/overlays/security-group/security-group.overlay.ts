import { AOverlay, Diff, DiffAction, DiffUtility, type IOverlay, type IResource, Overlay } from '@quadnix/octo';
import type { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';
import type { ISecurityGroupOverlayProperties } from './security-group.overlay.interface.js';

@Overlay()
export class SecurityGroupOverlay extends AOverlay<SecurityGroupOverlay> {
  override readonly MODEL_NAME: string = 'security-group-overlay';

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: ISecurityGroupOverlayProperties,
    anchors: SecurityGroupAnchor[],
  ) {
    super(overlayId, properties as unknown as IResource['properties'], anchors);
  }

  override async diff(previous: SecurityGroupOverlay): Promise<Diff[]> {
    const diffs: Diff[] = [];

    for (let i = 0; i < previous.anchors.length; i++) {
      const previousAnchor = this.anchors[i] as SecurityGroupAnchor;

      const currentAnchor = this.getAnchor(previousAnchor.anchorId);
      if (!currentAnchor) {
        diffs.push(new Diff(this, DiffAction.DELETE, 'overlayId', previousAnchor));
      } else {
        if (!DiffUtility.isObjectDeepEquals(previousAnchor.rules, (currentAnchor as SecurityGroupAnchor).rules)) {
          diffs.push(new Diff(this, DiffAction.UPDATE, 'overlayId', currentAnchor));
        }
      }
    }

    for (let i = 0; i < this.anchors.length; i++) {
      const currentAnchor = this.anchors[i] as SecurityGroupAnchor;

      const previousAnchor = previous.getAnchor(currentAnchor.anchorId);
      if (!previousAnchor) {
        diffs.push(new Diff(this, DiffAction.ADD, 'overlayId', currentAnchor));
      }
    }

    return diffs;
  }
}
