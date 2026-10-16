import { ActionEvent } from '../../events/index.js';
import { EventService } from '../../services/event/event.service.js';
import { Container } from '../container/container.js';
import type { Diff } from '../diff/diff.js';

/**
 * The base class of every resource action: an action implementing {@link IResourceAction} must extend
 * it. It gives the action the {@link Container}, and a `log()` that goes through Octo's event stream so
 * its output lands in the command's report alongside everything else.
 *
 * @example
 * ```ts
 * @Action(MyResource)
 * export class AddMyResourceAction extends ANodeAction implements IResourceAction<MyResource> { ... }
 * ```
 *
 * @group Functions/Node
 */
export abstract class ANodeAction {
  /**
   * The container, for resolving whatever services or SDK clients the action needs.
   */
  readonly container: Container;

  /**
   * @internal
   */
  protected constructor() {
    this.container = Container.getInstance();
  }

  /**
   * To report what the action is doing for `diff`, the diff its `handle()` was given. The message is
   * emitted as an {@link ActionEvent}, so it is picked up by whatever listeners the command has,
   * rather than written straight to the console.
   */
  log(diff: Diff, message: string, metadata: Record<string, unknown> = {}): void {
    EventService.getInstance().emit(
      new ActionEvent(this.constructor.name, {
        diff: { action: diff.action, field: diff.field, node: diff.node.getContext() },
        message,
        metadata,
      }),
    );
  }
}
