import { ActionInputs, ActionOutputs, ModelType } from '../app.type.js';
import { IAction } from '../models/action.interface.js';
import { IResourceAction } from '../resources/resource-action.interface.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { Container } from './container.js';

export function Action(type: ModelType): (constructor: any) => void {
  return function (constructor: any) {
    Container.get(TransactionService).then((transactionService) => {
      if (type === ModelType.MODEL) {
        Container.get<IAction<ActionInputs, ActionOutputs>>(constructor.name).then((modelAction) => {
          transactionService.registerModelActions([modelAction]);
        });
      } else if (type === ModelType.RESOURCE || type === ModelType.SHARED_RESOURCE) {
        Container.get<IResourceAction>(constructor.name).then((resourceAction) => {
          transactionService.registerResourceActions([resourceAction]);
        });
      }
    });
  };
}
