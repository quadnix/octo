import { AOverlay, type Diff, Overlay } from '@quadnix/octo';
import { AlbEcsExecutionAnchor } from '../../../../../anchors/alb-ecs-execution/alb-ecs-execution.anchor.js';
import { AwsAlbEcsExecutionSchema } from './aws-alb-ecs-execution.schema.js';

@Overlay('@octo', 'alb-ecs-execution-overlay', AwsAlbEcsExecutionSchema)
export class AwsAlbEcsExecutionOverlay extends AOverlay<AwsAlbEcsExecutionSchema, AwsAlbEcsExecutionOverlay> {
  declare properties: AwsAlbEcsExecutionSchema['properties'];

  constructor(overlayId: string, properties: AwsAlbEcsExecutionSchema['properties'], anchors: [AlbEcsExecutionAnchor]) {
    super(overlayId, properties, anchors);
  }

  override async diffAnchors(): Promise<Diff[]> {
    return [];
  }
}
