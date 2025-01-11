import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import { EcsCluster } from '../../../../../../resources/ecs-cluster/index.js';
import { type AwsEnvironmentModule, AwsResourceSchema } from '../../../aws-environment.module.js';
import { AwsEnvironment } from '../aws.environment.model.js';

@Action(AwsEnvironment)
export class AddEnvironmentModelAction implements IModelAction<AwsEnvironmentModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEnvironment &&
      (diff.node.constructor as typeof AwsEnvironment).NODE_NAME === 'environment' &&
      diff.field === 'environmentName'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsEnvironmentModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const environment = diff.node as AwsEnvironment;
    const region = actionInputs.inputs.region;

    const clusterName = [region.regionId, environment.environmentName].join('-');

    // Get AWS Region ID.
    const [[resourceSynth]] = await region.getResourcesMatchingSchema(AwsResourceSchema);
    const awsRegionId = resourceSynth.properties.awsRegionId;

    const ecsCluster = new EcsCluster(`ecs-cluster-${clusterName}`, {
      awsRegionId,
      clusterName,
      regionId: region.regionId,
    });

    actionOutputs[ecsCluster.resourceId] = ecsCluster;
    return actionOutputs;
  }
}

@Factory<AddEnvironmentModelAction>(AddEnvironmentModelAction)
export class AddEnvironmentModelActionFactory {
  private static instance: AddEnvironmentModelAction;

  static async create(): Promise<AddEnvironmentModelAction> {
    if (!this.instance) {
      this.instance = new AddEnvironmentModelAction();
    }
    return this.instance;
  }
}
