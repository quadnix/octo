import type {
  Constructable,
  IUnknownModelAction,
  IUnknownResourceAction,
  UnknownModel,
  UnknownNode,
  UnknownOverlay,
  UnknownResource,
} from '../app.type.js';
import { ModelActionHook } from '../functions/hook/model-action.hook.js';
import { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
import { AModel } from '../models/model.abstract.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import { AResource } from '../resources/resource.abstract.js';
import { EventService } from '../services/event/event.service.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import { Container } from '../functions/container/container.js';

function isModel(nodeClass: Constructable<UnknownNode>): nodeClass is Constructable<UnknownModel> {
  return nodeClass.prototype instanceof AModel;
}

function isOverlay(nodeClass: Constructable<UnknownNode>): nodeClass is Constructable<UnknownOverlay> {
  return nodeClass.prototype instanceof AOverlay;
}

function isResource(nodeClass: Constructable<UnknownNode>): nodeClass is Constructable<UnknownResource> {
  return nodeClass.prototype instanceof AResource;
}

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
export function Action<T extends UnknownNode>(forNode: Constructable<T>): (constructor: any) => void {
  const container = Container.getInstance();

  return function (constructor: any) {
    const promise = Promise.all([container.get(EventService), container.get(TransactionService)]).then(
      async ([eventService, transactionService]) => {
        if (isModel(forNode) && !isOverlay(forNode)) {
          // Register model action.
          const modelAction = await container.get<IUnknownModelAction>(constructor.name);
          transactionService.registerModelActions(forNode, [modelAction]);

          // Wrap model action with hooks.
          ModelActionHook.getInstance(eventService).registrar(modelAction);
        } else if (isOverlay(forNode)) {
          // Register overlay action.
          const modelAction = await container.get<IUnknownModelAction>(constructor.name);
          transactionService.registerOverlayActions(forNode, [modelAction]);

          // Wrap overlay action with hooks.
          ModelActionHook.getInstance(eventService).registrar(modelAction);
        } else if (isResource(forNode)) {
          // Register resource action.
          const resourceAction = await container.get<IUnknownResourceAction>(constructor.name);
          transactionService.registerResourceActions(forNode, [resourceAction]);

          // Wrap resource action with hooks.
          ResourceActionHook.getInstance(eventService).registrar(resourceAction);
        } else {
          throw new Error(`Class "${forNode.name}" is not recognized in @Action decorator!`);
        }
      },
    );
    container.registerStartupUnhandledPromise(promise);
  };
}
