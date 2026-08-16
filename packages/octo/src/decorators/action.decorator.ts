import type {
  Constructable,
  IUnknownModelAction,
  IUnknownResourceAction,
  UnknownModel,
  UnknownNode,
  UnknownOverlay,
  UnknownResource,
} from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { ModelActionHook } from '../functions/hook/model-action.hook.js';
import { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
import { AModel } from '../models/model.abstract.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import { AResource } from '../resources/resource.abstract.js';
import { TransactionService } from '../services/transaction/transaction.service.js';

/**
 * @internal
 */
function isModel(nodeClass: Constructable<UnknownNode>): nodeClass is Constructable<UnknownModel> {
  return nodeClass.prototype instanceof AModel;
}

/**
 * @internal
 */
function isOverlay(nodeClass: Constructable<UnknownNode>): nodeClass is Constructable<UnknownOverlay> {
  return nodeClass.prototype instanceof AOverlay;
}

/**
 * @internal
 */
function isResource(nodeClass: Constructable<UnknownNode>): nodeClass is Constructable<UnknownResource> {
  return nodeClass.prototype instanceof AResource;
}

/**
 * An `@Action` is a class decorator to be placed on top of a class that reacts to a change in the node it is
 * declared for. Octo diffs your infrastructure on every run, and invokes the actions whose node changed.
 *
 * The interface the action implements is determined by the node it is declared for.
 * - An action for a model or an overlay implements {@link IModelAction}, and produces resources.
 * - An action for a resource implements {@link IResourceAction}, and talks to the cloud provider.
 *
 * The decorated class is resolved through the {@link Container}, so it must have a registered {@link Factory}.
 *
 * @example
 * ```ts
 * @Action(MyModel)
 * export class AddMyModelAction implements IModelAction<MyModule> { ... }
 * ```
 * @group Decorators
 * @param forNode The class of node for which this action is being declared.
 * @returns The decorated class.
 * @see Definition of [Actions](/docs/fundamentals/actions).
 */
export function Action<T extends UnknownNode>(forNode: Constructable<T>): (constructor: any) => void {
  const container = Container.getInstance();

  return function (constructor: any) {
    const promise = container.get(TransactionService).then(async (transactionService) => {
      if (isModel(forNode) && !isOverlay(forNode)) {
        // Register model action.
        const modelAction = await container.get<IUnknownModelAction>(constructor.name);
        transactionService.registerModelActions(forNode, [modelAction]);

        // Wrap model action with hooks.
        ModelActionHook.getInstance().registrar(modelAction);
      } else if (isOverlay(forNode)) {
        // Register overlay action.
        const modelAction = await container.get<IUnknownModelAction>(constructor.name);
        transactionService.registerOverlayActions(forNode, [modelAction]);

        // Wrap overlay action with hooks.
        ModelActionHook.getInstance().registrar(modelAction);
      } else if (isResource(forNode)) {
        // Register resource action.
        const resourceAction = await container.get<IUnknownResourceAction>(constructor.name);
        transactionService.registerResourceActions(forNode, [resourceAction]);

        // Wrap resource action with hooks.
        ResourceActionHook.getInstance().registrar(resourceAction);
      } else {
        throw new Error(`Class "${forNode.name}" is not recognized in @Action decorator!`);
      }
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
