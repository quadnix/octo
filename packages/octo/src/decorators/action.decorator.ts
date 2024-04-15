import { ModelType } from '../app.type.js';
import { IModelAction } from '../models/model-action.interface.js';
import { IResourceAction } from '../resources/resource-action.interface.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { Container } from './container.js';

export function Action(type: ModelType): (constructor: any) => void {
  return function (constructor: any) {
    Container.get(TransactionService)
      .then(async (transactionService) => {
        if (type === ModelType.MODEL) {
          const modelAction = await Container.get<IModelAction>(constructor.name);
          transactionService.registerModelActions([modelAction]);
        } else if (type === ModelType.OVERLAY) {
          const modelAction = await Container.get<IModelAction>(constructor.name);
          transactionService.registerOverlayActions([modelAction]);
        } else if (type === ModelType.RESOURCE) {
          const resourceAction = await Container.get<IResourceAction>(constructor.name);
          transactionService.registerResourceActions([resourceAction]);
        } else {
          throw new Error('ModelType not recognized in @Action decorator!');
        }
      })
      .catch((error) => {
        console.error(error);
      });
  };
}
