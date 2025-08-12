import { ActionEvent } from '../../events/index.js';
import { EventService } from '../../services/event/event.service.js';
import { Container } from '../container/container.js';

export abstract class ANodeAction {
  readonly container: Container;

  protected constructor() {
    this.container = Container.getInstance();
  }

  async log(message: string, metadata: Record<string, unknown> = {}): Promise<void> {
    const eventService = await this.container.get(EventService);
    eventService.emit(new ActionEvent(this.constructor.name, { message, metadata }));
  }
}
