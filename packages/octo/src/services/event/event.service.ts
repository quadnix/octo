import { EventEmitter } from 'events';
import type { Constructable } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { Event } from '../../events/index.js';
import { Container } from '../../functions/container/container.js';

/**
 * @internal
 */
export class EventService {
  private readonly EVENT_BUFFER_SIZE = 50;

  private readonly emitter = new EventEmitter();

  private readonly eventBuffer: {
    [key: string]: { eventClass: Constructable<Event<unknown>>; events: Event<unknown>[] };
  } = {};

  private static instance: EventService | undefined;

  private readonly listeners: {
    [key: string]: {
      eventClass: Constructable<Event<unknown>>;
      eventListeners: ((event: Event<unknown>) => Promise<any>)[];
    };
  } = {};

  constructor() {
    this.emitter.on('*', (event: Event<unknown>) => {
      // Save event to EventBuffer.
      if (!this.eventBuffer[event.constructor.name]) {
        this.eventBuffer[event.constructor.name] = { eventClass: Object.getPrototypeOf(event).constructor, events: [] };
      }
      if (this.eventBuffer[event.constructor.name].events.length >= this.EVENT_BUFFER_SIZE) {
        this.eventBuffer[event.constructor.name].events.shift();
      }
      this.eventBuffer[event.constructor.name].events.push(event);

      // Forward event to matching listeners.
      this.forwardEvent(event);
    });
  }

  emit(event: Event<unknown>): void {
    this.emitter.emit('*', event);
  }

  forwardEvent(event: Event<unknown>, listeners: ((event: Event<unknown>) => Promise<any>)[] = []): void {
    if (!listeners.length) {
      for (const eventClassName of Object.keys(this.listeners)) {
        if (event instanceof this.listeners[eventClassName].eventClass) {
          for (const listener of this.listeners[eventClassName].eventListeners) {
            listener(event).catch((error) => {
              console.error(error);
            });
          }
        }
      }
    } else {
      for (const listener of listeners) {
        listener(event).catch((error) => {
          console.error(error);
        });
      }
    }
  }

  static getInstance(): EventService {
    if (!this.instance) {
      this.instance = new EventService();
    }
    return this.instance;
  }

  // TODO: https://github.com/quadnix/octo/issues/6
  registerListeners(eventClass: Constructable<Event<unknown>>, target: any, descriptor: PropertyDescriptor): void {
    if (!this.listeners[eventClass.name]) {
      this.listeners[eventClass.name] = { eventClass, eventListeners: [] };
    }

    // Register this listener.
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: [Event<unknown>]): Promise<any> {
      const listener = await Container.getInstance().get(target.constructor.name);
      return await originalMethod.apply(listener, args);
    };
    this.listeners[eventClass.name].eventListeners.push(descriptor.value);

    // Replay all previous events that were emitted before this listener was registered.
    const currentTimestamp = Date.now();
    for (const previousEventClassName of Object.keys(this.eventBuffer)) {
      const previousEventClass = this.eventBuffer[previousEventClassName].eventClass;
      if (previousEventClass.prototype instanceof eventClass || previousEventClass === eventClass) {
        for (const previousEvent of this.eventBuffer[previousEventClassName].events || []) {
          if (currentTimestamp >= previousEvent.header.timestamp) {
            this.forwardEvent(previousEvent, this.listeners[eventClass.name].eventListeners);
          }
        }
      }
    }
  }
}

/**
 * @internal
 */
@Factory<EventService>(EventService)
export class EventServiceFactory {
  static async create(): Promise<EventService> {
    return EventService.getInstance();
  }
}
