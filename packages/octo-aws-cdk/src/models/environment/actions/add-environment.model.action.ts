import { Action, ActionOutputs, Diff, DiffAction, Environment, Factory, ModelType } from '@quadnix/octo';
import { EcsCluster } from '../../../resources/ecs/ecs-cluster.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsRegion } from '../../region/aws.region.model.js';

@Action(ModelType.MODEL)
export class AddEnvironmentModelAction extends AAction {
  readonly ACTION_NAME: string = 'AddEnvironmentModelAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'environment' && diff.field === 'environmentName'
    );
  }

  async handle(diff: Diff): Promise<ActionOutputs> {
    const environment = diff.model as Environment;
    const environmentName = environment.environmentName;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const clusterName = [region.regionId, environmentName].join('-');

    const ecsCluster = new EcsCluster(`ecs-cluster-${clusterName}`, {
      awsRegionId: region.awsRegionId,
      clusterName,
      regionId: region.regionId,
    });

    const output: ActionOutputs = {};
    output[ecsCluster.resourceId] = ecsCluster;

    return output;
  }
}

@Factory<AddEnvironmentModelAction>(AddEnvironmentModelAction)
export class AddEnvironmentModelActionFactory {
  static async create(): Promise<AddEnvironmentModelAction> {
    return new AddEnvironmentModelAction();
  }
}
