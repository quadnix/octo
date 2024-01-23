import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Environment, Factory, ModelType } from '@quadnix/octo';
import { EcsCluster } from '../../../resources/ecs/ecs-cluster.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsRegion } from '../../region/aws.region.model.js';

@Action(ModelType.MODEL)
export class DeleteEnvironmentModelAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteEnvironmentModelAction';

  override collectInput(diff: Diff): string[] {
    const environment = diff.model as Environment;
    const environmentName = environment.environmentName;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const clusterName = [region.regionId, environmentName].join('-');

    return [`resource.${clusterName}-ecs-cluster`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'environment' && diff.field === 'environmentName'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const environment = diff.model as Environment;
    const environmentName = environment.environmentName;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const clusterName = [region.regionId, environmentName].join('-');

    const ecsCluster = actionInputs[`resource.${clusterName}-ecs-cluster`] as EcsCluster;
    ecsCluster.markDeleted();

    const output: ActionOutputs = {};
    output[ecsCluster.resourceId] = ecsCluster;

    return output;
  }
}

@Factory<DeleteEnvironmentModelAction>(DeleteEnvironmentModelAction)
export class DeleteEnvironmentModelActionFactory {
  static async create(): Promise<DeleteEnvironmentModelAction> {
    return new DeleteEnvironmentModelAction();
  }
}
