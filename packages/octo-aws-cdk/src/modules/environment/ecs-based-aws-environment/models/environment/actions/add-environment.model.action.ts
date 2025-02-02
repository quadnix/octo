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
import type { AwsEnvironmentModule } from '../../../aws-environment.module.js';
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
    _diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsEnvironmentModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { awsAccountId, awsRegionId, context } = actionInputs.metadata as Awaited<
      ReturnType<AwsEnvironmentModule['registerMetadata']>
    >;

    const ecsCluster = new EcsCluster(`ecs-cluster-${context.clusterName}`, {
      awsAccountId,
      awsRegionId,
      clusterName: context.clusterName,
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
