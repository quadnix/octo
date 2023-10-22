import { Diff, DiffAction, Environment, IActionOutputs } from '@quadnix/octo';
import { EcsCluster } from '../../../resources/ecs/ecs-cluster.resource.js';
import { SharedEcsCluster } from '../../../resources/ecs/ecs-cluster.shared-resource.js';
import { Action } from '../../action.abstract.js';
import { AwsRegion } from '../../region/aws.region.model.js';

export class AddEnvironmentAction extends Action {
  readonly ACTION_NAME: string = 'AddEnvironmentAction';

  constructor(private readonly region: AwsRegion) {
    super();
  }

  override collectOutput(diff: Diff): string[] {
    const { environmentName } = diff.model as Environment;

    return [`ecs-cluster-${environmentName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'environment' && diff.field === 'environmentName'
    );
  }

  handle(diff: Diff): IActionOutputs {
    const { environmentName } = diff.model as Environment;

    const ecsCluster = new EcsCluster(`ecs-cluster-${environmentName}`, {
      clusterName: environmentName,
    });
    const sharedEcsCluster = new SharedEcsCluster(ecsCluster);
    sharedEcsCluster.markUpdated('regions', `ADD:${this.region.regionId}`);

    const output: IActionOutputs = {};
    output[ecsCluster.resourceId] = sharedEcsCluster;

    return output;
  }
}
