import { Container } from 'typedi';
import { ActionInputs, ActionOutputs, ModelType } from '../app.type.js';
import { IAction } from '../models/action.interface.js';
import { IResourceAction } from '../resources/resource-action.interface.js';
import { TransactionService } from '../services/transaction/transaction.service.js';

export function Action(type: ModelType): (constructor: any) => void {
  return function (constructor: any) {
    const transactionService = Container.get(TransactionService);

    if (type === ModelType.MODEL) {
      const modelAction = Container.get<IAction<ActionInputs, ActionOutputs>>(constructor.name);
      transactionService.registerModelActions([modelAction]);
    } else if (type === ModelType.RESOURCE || type === ModelType.SHARED_RESOURCE) {
      const resourceAction = Container.get<IResourceAction>(constructor.name);
      transactionService.registerResourceActions([resourceAction]);
    }
  };
}
