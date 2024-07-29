import { Event } from './event.model.js';

/**
 * This event is emitted when a module's `onInit()` method is run.
 * It emits the name of the module.
 *
 * @example
 * ```ts
 * const myEvent = new ModuleEvent('MyModule');
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ModuleEvent extends Event<string> {}
