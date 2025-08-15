import { ActionEvent } from '../../events/index.js';
import { EventService } from '../../services/event/event.service.js';
import { Container } from '../container/container.js';

export abstract class ANodeAction {
  readonly container: Container;
  private readonly eventService: Promise<EventService>;

  protected constructor() {
    this.container = Container.getInstance();
    this.eventService = this.container.get(EventService);
  }

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
