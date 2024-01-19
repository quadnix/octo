import { Action, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { AAction } from '../../../action.abstract.js';
import { EcrService } from '../ecr.service.model.js';

@Action(ModelType.MODEL)
export class AddEcrServiceAction extends AAction {
  readonly ACTION_NAME: string = 'AddEcrServiceAction';

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

@Factory<AddEcrServiceAction>(AddEcrServiceAction)
export class AddEcrServiceActionFactory {
  static async create(): Promise<AddEcrServiceAction> {
    return new AddEcrServiceAction();
  }
}
