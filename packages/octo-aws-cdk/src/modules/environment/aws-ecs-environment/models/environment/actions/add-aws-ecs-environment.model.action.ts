import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import { EcsCluster } from '../../../../../../resources/ecs-cluster/index.js';
import type { AwsEcsEnvironmentModule } from '../../../aws-ecs-environment.module.js';
import { AwsEcsEnvironment } from '../aws-ecs-environment.model.js';

/**
 * @internal
 */
@Action(AwsEcsEnvironment)
export class AddAwsEcsEnvironmentModelAction implements IModelAction<AwsEcsEnvironmentModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsEnvironment &&
      hasNodeName(diff.node, 'environment') &&
      diff.field === 'environmentName'
    );
  }

  async handle(
    _diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsEcsEnvironmentModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { awsAccountId, awsRegionId, clusterName } = actionInputs.metadata;

    const ecsCluster = new EcsCluster(`ecs-cluster-${clusterName}`, {
      awsAccountId,
      awsRegionId,
      clusterName,
    });

    actionOutputs[ecsCluster.resourceId] = ecsCluster;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEcsEnvironmentModelAction>(AddAwsEcsEnvironmentModelAction)
export class AddAwsEcsEnvironmentModelActionFactory {
  private static instance: AddAwsEcsEnvironmentModelAction;

  static async create(): Promise<AddAwsEcsEnvironmentModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsEnvironmentModelAction();
    }
    return this.instance;
  }
}
