import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { Alb } from '../alb.resource.js';
import type { AlbSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(Alb)
export class CaptureAlbResponseResourceAction implements IResourceAction<Alb> {
  filter(diff: Diff): boolean {
    return diff.node instanceof Alb && hasNodeName(diff.node, 'alb');
  }

  async handle(_diff: Diff<Alb>): Promise<void> {}

  async mock(_diff: Diff<Alb>, capture: Partial<AlbSchema['response']>): Promise<AlbSchema['response']> {
    return {
      DNSName: capture.DNSName,
      LoadBalancerArn: capture.LoadBalancerArn,
    };
  }
}

@Factory<CaptureAlbResponseResourceAction>(CaptureAlbResponseResourceAction)
export class CaptureAlbResponseResourceActionFactory {
  private static instance: CaptureAlbResponseResourceAction;

  static async create(): Promise<CaptureAlbResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureAlbResponseResourceAction();
    }
    return this.instance;
  }
}
