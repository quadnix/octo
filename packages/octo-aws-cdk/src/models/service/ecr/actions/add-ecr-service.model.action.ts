import { Action, type ActionOutputs, Diff, DiffAction, Factory, type IModelAction, ModelType } from '@quadnix/octo';
import { EcrService } from '../ecr.service.model.js';

@Action(ModelType.MODEL)
export class AddEcrServiceModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddEcrServiceModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof EcrService &&
      diff.model.MODEL_NAME === 'service' &&
      diff.field === 'serviceId'
    );
  }

  async handle(): Promise<ActionOutputs> {
    return {};
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddEcrServiceModelAction>(AddEcrServiceModelAction)
export class AddEcrServiceModelActionFactory {
  static async create(): Promise<AddEcrServiceModelAction> {
    return new AddEcrServiceModelAction();
  }
}
