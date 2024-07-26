import type { EventService } from '../services/event/event.service.js';

export class Event<T> {
  readonly header: {
    timestamp: number;
  };

  readonly payload: T;

  readonly userData: object;

  constructor(payload: T, userData: object = {}) {
    this.header = {
      timestamp: Date.now(),
    };
    this.payload = payload;
    this.userData = userData;
  }

  static registrar(...args: [EventService, PropertyDescriptor]): void {
    if (args.length !== 2) {
      throw new Error('Invalid number of args in event registrar!');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}
