import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { AlbListener } from '../alb-listener.resource.js';
import type { AlbListenerSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(AlbListener)
export class CaptureAlbListenerResponseResourceAction implements IResourceAction<AlbListener> {
  filter(diff: Diff): boolean {
    return diff.node instanceof AlbListener && hasNodeName(diff.node, 'alb-listener');
  }

  async handle(_diff: Diff<AlbListener>): Promise<void> {}

  async mock(
    _diff: Diff<AlbListener>,
    capture: Partial<AlbListenerSchema['response']>,
  ): Promise<AlbListenerSchema['response']> {
    return {
      ListenerArn: capture.ListenerArn,
    };
  }
}

@Factory<CaptureAlbListenerResponseResourceAction>(CaptureAlbListenerResponseResourceAction)
export class CaptureAlbListenerResponseResourceActionFactory {
  private static instance: CaptureAlbListenerResponseResourceAction;

  static async create(): Promise<CaptureAlbListenerResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureAlbListenerResponseResourceAction();
    }
    return this.instance;
  }
}
