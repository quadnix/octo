import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { Efs } from '../efs.resource.js';
import type { EfsSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(Efs)
export class CaptureEfsResponseResourceAction implements IResourceAction<Efs> {
  filter(diff: Diff): boolean {
    return diff.node instanceof Efs && hasNodeName(diff.node, 'efs');
  }

  async handle(_diff: Diff<Efs>): Promise<void> {}

  async mock(_diff: Diff<Efs>, capture: Partial<EfsSchema['response']>): Promise<EfsSchema['response']> {
    return {
      FileSystemArn: capture.FileSystemArn,
      FileSystemId: capture.FileSystemId,
    };
  }
}

@Factory<CaptureEfsResponseResourceAction>(CaptureEfsResponseResourceAction)
export class CaptureEfsResponseResourceActionFactory {
  private static instance: CaptureEfsResponseResourceAction;

  static async create(): Promise<CaptureEfsResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureEfsResponseResourceAction();
    }
    return this.instance;
  }
}
