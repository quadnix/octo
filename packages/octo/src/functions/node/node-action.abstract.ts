import { ActionEvent } from '../../events/index.js';
import { EventService } from '../../services/event/event.service.js';
import { Container } from '../container/container.js';

/**
 * An optional base class for a model or resource action.
 *
 * Extending it is a convenience, not a requirement - an action only has to implement
 * {@link IModelAction} or {@link IResourceAction}. What you get here is the {@link Container},
 * and a `log()` that goes through Octo's event stream so your output lands in the command's report
 * alongside everything else.
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
  private readonly eventService: Promise<EventService>;

  /**
   * @internal
   */
  protected constructor() {
    this.container = Container.getInstance();
    this.eventService = this.container.get(EventService);
  }

  /**
   * To report what the action is doing. The message is emitted as an {@link ActionEvent}, so it is
   * picked up by whatever listeners the command has, rather than written straight to the console.
   */
  log(message: string, metadata: Record<string, unknown> = {}): void {
    this.eventService
      .then((eventService) =>
        eventService.emit(
          new ActionEvent(this.constructor.name, {
            message,
            metadata,
          }),
        ),
      )
      .catch((error) => {
        console.error(`Unable to log action "${this.constructor.name}" with message "${message}"`, error);
      });
  }
}
