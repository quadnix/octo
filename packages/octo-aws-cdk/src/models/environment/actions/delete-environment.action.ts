import { Diff, DiffAction, Environment, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { SharedEcsCluster } from '../../../resources/ecs/ecs-cluster.shared-resource.js';
import { Action } from '../../action.abstract.js';
import { AwsRegion } from '../../region/aws.region.model.js';

export class DeleteEnvironmentAction extends Action {
  readonly ACTION_NAME: string = 'DeleteEnvironmentAction';

  constructor(private readonly region: AwsRegion) {
    super();
  }

  override collectInput(diff: Diff): string[] {
    const { environmentName } = diff.model as Environment;

    return [`resource.ecs-cluster-${environmentName}`];
  }

  override collectOutput(diff: Diff): string[] {
    const { environmentName } = diff.model as Environment;

    return [`ecs-cluster-${environmentName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'environment' && diff.field === 'environmentName'
    );
  }

  handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs {
    const { environmentName } = diff.model as Environment;

    const sharedEcsCluster = actionInputs[`resource.ecs-cluster-${environmentName}`] as SharedEcsCluster;
    sharedEcsCluster.markUpdated('regions', `DELETE:${this.region.regionId}`);

    const output: IActionOutputs = {};
    output[sharedEcsCluster.resourceId] = sharedEcsCluster;

    return output;
  }
}
