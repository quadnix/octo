import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EcrImage } from '../ecr-image.resource.js';
import type { EcrImageSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EcrImage)
export class CaptureEcrImageResponseResourceAction implements IResourceAction<EcrImage> {
  filter(diff: Diff): boolean {
    return diff.node instanceof EcrImage && hasNodeName(diff.node, 'ecr-image');
  }

  async handle(_diff: Diff<EcrImage>): Promise<void> {}

  async mock(_diff: Diff<EcrImage>, capture: Partial<EcrImageSchema['response']>): Promise<EcrImageSchema['response']> {
    return {
      registryId: capture.registryId,
      repositoryArn: capture.repositoryArn,
      repositoryName: capture.repositoryName,
      repositoryUri: capture.repositoryUri,
    };
  }
}

@Factory<CaptureEcrImageResponseResourceAction>(CaptureEcrImageResponseResourceAction)
export class CaptureEcrImageResponseResourceActionFactory {
  private static instance: CaptureEcrImageResponseResourceAction;

  static async create(): Promise<CaptureEcrImageResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureEcrImageResponseResourceAction();
    }
    return this.instance;
  }
}
