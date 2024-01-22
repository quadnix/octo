import { Action, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { AAction } from '../../../action.abstract.js';
import { EcrService } from '../ecr.service.model.js';

@Action(ModelType.MODEL)
export class AddEcrServiceModelAction extends AAction {
  readonly ACTION_NAME: string = 'AddEcrServiceModelAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model.MODEL_NAME === 'service' &&
      (diff.model as EcrService).serviceId.endsWith('ecr') &&
      diff.field === 'serviceId'
    );
  }

  async handle(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddEcrServiceModelAction>(AddEcrServiceModelAction)
export class AddEcrServiceModelActionFactory {
  static async create(): Promise<AddEcrServiceModelAction> {
    return new AddEcrServiceModelAction();
  }
}
