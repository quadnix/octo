import { Action, type ActionOutputs, Diff, DiffAction, Factory, type IModelAction, ModelType } from '@quadnix/octo';
import { EcsCluster } from '../../../resources/ecs/ecs-cluster.resource.js';
import type { AwsRegion } from '../../region/aws.region.model.js';
import { AwsEnvironment } from '../aws.environment.model.js';

@Action(ModelType.MODEL)
export class AddEnvironmentModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddEnvironmentModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof AwsEnvironment &&
      diff.model.MODEL_NAME === 'environment' &&
      diff.field === 'environmentName'
    );
  }

  async handle(diff: Diff): Promise<ActionOutputs> {
    const environment = diff.model as AwsEnvironment;
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

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddEnvironmentModelAction>(AddEnvironmentModelAction)
export class AddEnvironmentModelActionFactory {
  static async create(): Promise<AddEnvironmentModelAction> {
    return new AddEnvironmentModelAction();
  }
}
