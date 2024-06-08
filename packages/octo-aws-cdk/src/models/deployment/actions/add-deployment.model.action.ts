import { Action, type ActionOutputs, Diff, DiffAction, Factory, type IModelAction, ModelType } from '@quadnix/octo';
import { AwsDeployment } from '../aws.deployment.model.js';

@Action(ModelType.MODEL)
export class AddDeploymentModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddDeploymentModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
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

@Factory<AddDeploymentModelAction>(AddDeploymentModelAction)
export class AddDeploymentModelActionFactory {
  static async create(): Promise<AddDeploymentModelAction> {
    return new AddDeploymentModelAction();
  }
}
