import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import type { SecurityGroupAnchor } from '../../../../../anchors/security-group/security-group.anchor.js';
import type { SecurityGroupAnchorSchema } from '../../../../../anchors/security-group/security-group.anchor.schema.js';
import { ServerExecutionSecurityGroupOverlaySchema } from './server-execution-security-group.overlay.schema.js';

/**
 * @internal
 */
@Overlay('@octo', 'server-execution-security-group-overlay', ServerExecutionSecurityGroupOverlaySchema)
export class ServerExecutionSecurityGroupOverlay extends AOverlay<
  ServerExecutionSecurityGroupOverlaySchema,
  ServerExecutionSecurityGroupOverlay
> {
  declare anchors: (MatchingAnchor<SecurityGroupAnchorSchema> | SecurityGroupAnchor)[];
  declare properties: ServerExecutionSecurityGroupOverlaySchema['properties'];

  constructor(
    overlayId: string,
    properties: ServerExecutionSecurityGroupOverlaySchema['properties'],
    anchors: (MatchingAnchor<SecurityGroupAnchorSchema> | SecurityGroupAnchor)[],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
