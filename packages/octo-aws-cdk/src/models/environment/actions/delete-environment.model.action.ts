import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import type { EcsCluster } from '../../../resources/ecs/ecs-cluster.resource.js';
import type { AwsRegion } from '../../region/aws.region.model.js';
import { AwsEnvironment } from '../aws.environment.model.js';

@Action(ModelType.MODEL)
export class DeleteEnvironmentModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteEnvironmentModelAction';

  collectInput(diff: Diff): string[] {
    const environment = diff.model as AwsEnvironment;
    const environmentName = environment.environmentName;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const clusterName = [region.regionId, environmentName].join('-');

    return [`resource.ecs-cluster-${clusterName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof AwsEnvironment &&
      diff.model.MODEL_NAME === 'environment' &&
      diff.field === 'environmentName'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const environment = diff.model as AwsEnvironment;
    const environmentName = environment.environmentName;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const clusterName = [region.regionId, environmentName].join('-');

    const ecsCluster = actionInputs[`resource.ecs-cluster-${clusterName}`] as EcsCluster;
    ecsCluster.remove();
    actionOutputs[ecsCluster.resourceId] = ecsCluster;

    return actionOutputs;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteEnvironmentModelAction>(DeleteEnvironmentModelAction)
export class DeleteEnvironmentModelActionFactory {
  static async create(): Promise<DeleteEnvironmentModelAction> {
    return new DeleteEnvironmentModelAction();
  }
}
