import { NodeType } from '../app.type.js';
import { ModelActionHook } from '../functions/hook/model-action.hook.js';
import { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
import { type IModelAction } from '../models/model-action.interface.js';
import { type IResourceAction } from '../resources/resource-action.interface.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { Container } from '../functions/container/container.js';

/**
 * An `@Action` is a class decorator to be placed on top of a class that represents an action of one of ModelType.
 * - A NodeType.MODEL action must implement the {@link IModelAction} interface.
 * - A NodeType.OVERLAY action must implement the {@link IModelAction} interface.
 * - A NodeType.RESOURCE action must implement the {@link IResourceAction} interface.
 * - A NodeType.SHARED_RESOURCE action must implement the {@link IResourceAction} interface.
 *
 * @example
 * ```ts
 * @Action(ModelType.MODEL)
 * export class MyModelAction implements IModelAction { ... }
 * ```
 * @group Decorators
 * @param type The type of Model being decorated.
 * @returns The decorated class.
 * @see Definition of [Actions](/docs/fundamentals/actions).
 */
export function Action(type: NodeType): (constructor: any) => void {
  return function (constructor: any) {
    const promise = Container.get(TransactionService).then(async (transactionService) => {
      switch (type) {
        case NodeType.MODEL: {
          // Register model action.
          const modelAction = await Container.get<IModelAction>(constructor.name);
          transactionService.registerModelActions([modelAction]);

          // Wrap model action with hooks.
          ModelActionHook.getInstance().registrar(modelAction);
          break;
        }
        case NodeType.OVERLAY: {
          // Register overlay action.
          const modelAction = await Container.get<IModelAction>(constructor.name);
          transactionService.registerOverlayActions([modelAction]);

          // Wrap overlay action with hooks.
          ModelActionHook.getInstance().registrar(modelAction);
          break;
        }
        case NodeType.RESOURCE: {
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
    });
    Container.registerStartupUnhandledPromise(promise);
  };
}
