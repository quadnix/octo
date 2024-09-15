import { type Constructable, type UnknownNode, isModel, isOverlay, isResource } from '../app.type.js';
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
 * @Action(MyModelClass)
 * export class MyModelAction implements IModelAction { ... }
 * ```
 * @group Decorators
 * @param forNode The class of node for which this action is being declared.
 * @returns The decorated class.
 * @see Definition of [Actions](/docs/fundamentals/actions).
 */
export function Action(forNode: Constructable<UnknownNode>): (constructor: any) => void {
  return function (constructor: any) {
    const promise = Container.get(TransactionService).then(async (transactionService) => {
      if (isModel(forNode) && !isOverlay(forNode)) {
        // Register model action.
        const modelAction = await Container.get<IModelAction>(constructor.name);
        transactionService.registerModelActions(forNode, [modelAction]);

        // Wrap model action with hooks.
        ModelActionHook.getInstance().registrar(modelAction);
      } else if (isOverlay(forNode)) {
        // Register overlay action.
        const modelAction = await Container.get<IModelAction>(constructor.name);
        transactionService.registerOverlayActions(forNode, [modelAction]);

        // Wrap overlay action with hooks.
        ModelActionHook.getInstance().registrar(modelAction);
      } else if (isResource(forNode)) {
        // Register resource action.
        const resourceAction = await Container.get<IResourceAction>(constructor.name);
        transactionService.registerResourceActions(forNode, [resourceAction]);

        // Wrap resource action with hooks.
        ResourceActionHook.getInstance().registrar(resourceAction);
      } else {
        throw new Error(`Class "${forNode.name}" is not recognized in @Action decorator!`);
      }
    });
    Container.registerStartupUnhandledPromise(promise);
  };
}
