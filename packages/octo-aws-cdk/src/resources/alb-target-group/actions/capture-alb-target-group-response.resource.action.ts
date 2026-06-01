import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { AlbTargetGroup } from '../alb-target-group.resource.js';
import type { AlbTargetGroupSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(AlbTargetGroup)
export class CaptureAlbTargetGroupResponseResourceAction implements IResourceAction<AlbTargetGroup> {
  filter(diff: Diff): boolean {
    return diff.node instanceof AlbTargetGroup && hasNodeName(diff.node, 'alb-target-group');
  }

  async handle(_diff: Diff<AlbTargetGroup>): Promise<void> {}

  async mock(
    _diff: Diff<AlbTargetGroup>,
    capture: Partial<AlbTargetGroupSchema['response']>,
  ): Promise<AlbTargetGroupSchema['response']> {
    return {
      TargetGroupArn: capture.TargetGroupArn,
    };
  }
}

@Factory<CaptureAlbTargetGroupResponseResourceAction>(CaptureAlbTargetGroupResponseResourceAction)
export class CaptureAlbTargetGroupResponseResourceActionFactory {
  private static instance: CaptureAlbTargetGroupResponseResourceAction;

  static async create(): Promise<CaptureAlbTargetGroupResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureAlbTargetGroupResponseResourceAction();
    }
    return this.instance;
  }
}
