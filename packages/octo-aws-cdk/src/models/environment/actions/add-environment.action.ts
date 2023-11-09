import { Action, ActionOutputs, Diff, DiffAction, Environment, Factory, ModelType } from '@quadnix/octo';
import { EcsCluster } from '../../../resources/ecs/ecs-cluster.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsRegion } from '../../region/aws.region.model.js';

@Action(ModelType.MODEL)
export class AddEnvironmentAction extends AAction {
  readonly ACTION_NAME: string = 'AddEnvironmentAction';

  override collectOutput(diff: Diff): string[] {
    const environment = diff.model as Environment;
    const environmentName = environment.environmentName;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const clusterName = [region.regionId, environmentName].join('-');

    return [`ecs-cluster-${clusterName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'environment' && diff.field === 'environmentName'
    );
  }

  handle(diff: Diff): ActionOutputs {
    const environment = diff.model as Environment;
    const environmentName = environment.environmentName;
    const region = environment.getParents()['region'][0].to as AwsRegion;
    const clusterName = [region.regionId, environmentName].join('-');

    const ecsCluster = new EcsCluster(`ecs-cluster-${clusterName}`, {
      awsRegionId: region.nativeAwsRegionId,
      clusterName,
      regionId: region.regionId,
    });

    const output: ActionOutputs = {};
    output[ecsCluster.resourceId] = ecsCluster;

    return output;
  }
}

@Factory<AddEnvironmentAction>(AddEnvironmentAction)
export class AddEnvironmentActionFactory {
  static async create(): Promise<AddEnvironmentAction> {
    return new AddEnvironmentAction();
  }
}
