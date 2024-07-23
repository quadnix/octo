import { EventEmitter } from 'events';
import { Constructable } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { Event } from '../../functions/event/event.model.js';

export class EventService {
  private readonly emitter = new EventEmitter();

  private static instance: EventService;

  private readonly listeners: { [key: string]: ((event: Event<unknown>) => Promise<any>)[] } = {};

  constructor() {
    this.emitter.on('*', async (event: Event<unknown>) => {
      for (const listener of this.listeners[event.constructor.name] || []) {
        await listener(event);
      }
    });
  }

  emit(event: Event<unknown>): void {
    this.emitter.emit('*', event);
  }

  static getInstance(): EventService {
    if (!this.instance) {
      this.instance = new EventService();
    }
    return this.instance;
  }

  registerListeners(event: Constructable<Event<unknown>>, descriptor: PropertyDescriptor): void {
    if (!this.listeners[event.name]) {
      this.listeners[event.name] = [];
    }

    this.listeners[event.name].push(descriptor.value);
  }
}

@Factory<EventService>(EventService)
export class EventServiceFactory {
  static async create(): Promise<EventService> {
    return EventService.getInstance();
  }
}
