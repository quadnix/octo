import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EcsCluster } from '../ecs-cluster.resource.js';
import type { EcsClusterSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(EcsCluster)
export class CaptureEcsClusterResponseResourceAction implements IResourceAction<EcsCluster> {
  filter(diff: Diff): boolean {
    return diff.node instanceof EcsCluster && hasNodeName(diff.node, 'ecs-cluster');
  }

  async handle(_diff: Diff<EcsCluster>): Promise<void> {}

  async mock(
    _diff: Diff<EcsCluster>,
    capture: Partial<EcsClusterSchema['response']>,
  ): Promise<EcsClusterSchema['response']> {
    return {
      clusterArn: capture.clusterArn,
    };
  }
}

@Factory<CaptureEcsClusterResponseResourceAction>(CaptureEcsClusterResponseResourceAction)
export class CaptureEcsClusterResponseResourceActionFactory {
  private static instance: CaptureEcsClusterResponseResourceAction;

  static async create(): Promise<CaptureEcsClusterResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureEcsClusterResponseResourceAction();
    }
    return this.instance;
  }
}
