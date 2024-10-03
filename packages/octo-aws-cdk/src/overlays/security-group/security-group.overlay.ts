import { AOverlay, Diff, type IOverlay, Overlay } from '@quadnix/octo';
import type { SecurityGroupAnchor } from '../../anchors/security-group.anchor.js';
import type { ISecurityGroupOverlayProperties } from './security-group.overlay.interface.js';

@Overlay('@octo', 'security-group-overlay')
export class SecurityGroupOverlay extends AOverlay<SecurityGroupOverlay> {
  declare properties: ISecurityGroupOverlayProperties;

  constructor(
    overlayId: IOverlay['overlayId'],
    properties: ISecurityGroupOverlayProperties,
    anchors: SecurityGroupAnchor[],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
