import { EventEmitter } from 'events';
import { Constructable } from '../../app.type.js';
import { Container } from '../../decorators/container.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { Event } from '../../events/event.model.js';

export class EventService {
  private readonly EVENT_BUFFER_SIZE = 50;

  private readonly emitter = new EventEmitter();

  private readonly eventBuffer: { [key: string]: Event<unknown>[] } = {};

  private static instance: EventService;

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
        this.eventBuffer[event.constructor.name] = [];
      }
      if (this.eventBuffer[event.constructor.name].length >= this.EVENT_BUFFER_SIZE) {
        this.eventBuffer[event.constructor.name].shift();
      }
      this.eventBuffer[event.constructor.name].push(event);

      // Forward event to matching listeners.
      this.forwardEvent(event);
    });
  }

  emit(event: Event<unknown>): void {
    this.emitter.emit('*', event);
  }

  forwardEvent(event: Event<unknown>): void {
    for (const eventClassName of Object.keys(this.listeners)) {
      if (event instanceof this.listeners[eventClassName].eventClass) {
        for (const listener of this.listeners[eventClassName].eventListeners) {
          listener(event).catch((error) => {
            console.error(error);
          });
        }
      }
    }
  }

  static getInstance(): EventService {
    if (!this.instance) {
      this.instance = new EventService();
    }
    return this.instance;
  }

  registerListeners(eventClass: Constructable<Event<unknown>>, target: any, descriptor: PropertyDescriptor): void {
    if (!this.listeners[eventClass.name]) {
      this.listeners[eventClass.name] = { eventClass, eventListeners: [] };
    }

    // Register this listener.
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: [Event<unknown>]): Promise<any> {
      const listener = await Container.get(target.constructor.name);
      return await originalMethod.apply(listener, args);
    };
    this.listeners[eventClass.name].eventListeners.push(descriptor.value);

    // Replay all previous events that were emitted before this listener was registered.
    const currentTimestamp = Date.now();
    for (const previousEvent of this.eventBuffer[eventClass.name] || []) {
      if (currentTimestamp >= previousEvent.header.timestamp) {
        this.forwardEvent(previousEvent);
      }
    }
  }
}

@Factory<EventService>(EventService)
export class EventServiceFactory {
  static async create(): Promise<EventService> {
    return EventService.getInstance();
  }
}
