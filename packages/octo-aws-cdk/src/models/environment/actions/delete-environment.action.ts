import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Environment, Factory, ModelType } from '@quadnix/octo';
import { EcsCluster } from '../../../resources/ecs/ecs-cluster.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsRegion } from '../../region/aws.region.model.js';

@Action(ModelType.MODEL)
export class DeleteEnvironmentAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteEnvironmentAction';

  override collectInput(diff: Diff): string[] {
    const environment = diff.model as Environment;
    const environmentName = environment.environmentName;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const clusterName = [region.regionId, environmentName].join('-');

    return [`resource.ecs-cluster-${clusterName}`];
  }

  override collectOutput(diff: Diff): string[] {
    const environment = diff.model as Environment;
    const environmentName = environment.environmentName;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const clusterName = [region.regionId, environmentName].join('-');

    return [`ecs-cluster-${clusterName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'environment' && diff.field === 'environmentName'
    );
  }

  handle(diff: Diff, actionInputs: ActionInputs): ActionOutputs {
    const environment = diff.model as Environment;
    const environmentName = environment.environmentName;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const clusterName = [region.regionId, environmentName].join('-');

    const ecsCluster = actionInputs[`resource.ecs-cluster-${clusterName}`] as EcsCluster;
    ecsCluster.markDeleted();

    const output: ActionOutputs = {};
    output[ecsCluster.resourceId] = ecsCluster;

    return output;
  }
}

@Factory<DeleteEnvironmentAction>(DeleteEnvironmentAction)
export class DeleteEnvironmentActionFactory {
  static async create(): Promise<DeleteEnvironmentAction> {
    return new DeleteEnvironmentAction();
  }
}
