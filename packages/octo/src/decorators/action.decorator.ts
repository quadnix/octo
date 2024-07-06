import { ModelType } from '../app.type.js';
import { ModelActionHook } from '../functions/hook/model-action.hook.js';
import { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
import { type IModelAction } from '../models/model-action.interface.js';
import { type IResourceAction } from '../resources/resource-action.interface.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { Container } from './container.js';

export function Action(type: ModelType): (constructor: any) => void {
  return function (constructor: any) {
    Container.get(TransactionService)
      .then(async (transactionService) => {
        switch (type) {
          case ModelType.MODEL: {
            // Register model action.
            const modelAction = await Container.get<IModelAction>(constructor.name);
            transactionService.registerModelActions([modelAction]);

            // Wrap model action with hooks.
            ModelActionHook.getInstance().registrar(modelAction);
            break;
          }
          case ModelType.OVERLAY: {
            // Register overlay action.
            const modelAction = await Container.get<IModelAction>(constructor.name);
            transactionService.registerOverlayActions([modelAction]);

            // Wrap overlay action with hooks.
            ModelActionHook.getInstance().registrar(modelAction);
            break;
          }
          case ModelType.RESOURCE: {
            // Register resource action.
            const resourceAction = await Container.get<IResourceAction>(constructor.name);
            transactionService.registerResourceActions([resourceAction]);

            // Wrap resource action with hooks.
            ResourceActionHook.getInstance().registrar(resourceAction);
            break;
          }
          default: {
            throw new Error('ModelType not recognized in @Action decorator!');
          }
        }
      })
      .catch((error) => {
        console.error(error);
      });
  };
}
