import { AOverlay, type Diff, type MatchingAnchor, Overlay } from '@quadnix/octo';
import { AwsEcsAlbAnchor } from '../../../../../anchors/aws-ecs/aws-ecs-alb.anchor.js';
import type { AwsEcsServiceAnchorSchema } from '../../../../../anchors/aws-ecs/aws-ecs-service.anchor.schema.js';
import { AwsEcsAlbServiceOverlaySchema } from './aws-ecs-alb-service.schema.js';

/**
 * @internal
 */
@Overlay('@octo', 'aws-ecs-alb-service-overlay', AwsEcsAlbServiceOverlaySchema)
export class AwsEcsAlbServiceOverlay extends AOverlay<AwsEcsAlbServiceOverlaySchema, AwsEcsAlbServiceOverlay> {
  declare properties: AwsEcsAlbServiceOverlaySchema['properties'];

  constructor(
    overlayId: string,
    properties: AwsEcsAlbServiceOverlaySchema['properties'],
    anchors: [AwsEcsAlbAnchor, ...MatchingAnchor<AwsEcsServiceAnchorSchema>[]],
  ) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
