import { Action, type ActionOutputs, Diff, DiffAction, Factory, type IModelAction, ModelType } from '@quadnix/octo';
import { AwsDeployment } from '../aws.deployment.model.js';

@Action(ModelType.MODEL)
export class DeleteDeploymentModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteDeploymentModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof AwsDeployment &&
      diff.model.MODEL_NAME === 'deployment' &&
      diff.field === 'deploymentTag'
    );
  }

  async handle(): Promise<ActionOutputs> {
    return {};
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteDeploymentModelAction>(DeleteDeploymentModelAction)
export class DeleteDeploymentModelActionFactory {
  static async create(): Promise<DeleteDeploymentModelAction> {
    return new DeleteDeploymentModelAction();
  }
}
