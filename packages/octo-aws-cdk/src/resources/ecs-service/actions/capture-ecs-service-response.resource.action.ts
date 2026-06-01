import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EcsService } from '../ecs-service.resource.js';
import type { EcsServiceSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EcsService)
export class CaptureEcsServiceResponseResourceAction implements IResourceAction<EcsService> {
  filter(diff: Diff): boolean {
    return diff.node instanceof EcsService && hasNodeName(diff.node, 'ecs-service');
  }

  async handle(_diff: Diff<EcsService>): Promise<void> {}

  async mock(
    _diff: Diff<EcsService>,
    capture: Partial<EcsServiceSchema['response']>,
  ): Promise<EcsServiceSchema['response']> {
    return {
      serviceArn: capture.serviceArn,
    };
  }
}

@Factory<CaptureEcsServiceResponseResourceAction>(CaptureEcsServiceResponseResourceAction)
export class CaptureEcsServiceResponseResourceActionFactory {
  private static instance: CaptureEcsServiceResponseResourceAction;

  static async create(): Promise<CaptureEcsServiceResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureEcsServiceResponseResourceAction();
    }
    return this.instance;
  }
}
