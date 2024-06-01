import { AOverlay, Diff, DiffAction, DiffUtility, IOverlay, IResource, Overlay } from '@quadnix/octo';
import { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';
import { ISecurityGroupOverlayProperties } from './security-group.overlay.interface.js';

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

  override async diff(previous?: SecurityGroupOverlay): Promise<Diff[]> {
    const diffs: Diff[] = [];

    // Include diff of each anchor rules.
    if (previous) {
      for (let i = 0; i < this.anchors.length; i++) {
        const anchor = this.anchors[i] as SecurityGroupAnchor;

        if (!DiffUtility.isObjectDeepEquals((previous.anchors[i] as SecurityGroupAnchor).rules, anchor.rules)) {
          diffs.push(new Diff(this, DiffAction.UPDATE, 'overlayId', anchor));
        }
      }
    } else {
      for (const anchor of this.anchors) {
        diffs.push(new Diff(this, DiffAction.ADD, 'overlayId', anchor));
      }
    }

    return diffs;
  }
}
