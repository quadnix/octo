import { Event } from './event.model.js';

/**
 * This event is emitted when a module's `onInit()` method is run, once for every module id, with the
 * inputs it ran with: the definition's values, references resolved, and schema defaults filled in.
 * Its name is the module's class name.
 *
 * @group Events/Module
 */
export class ModuleEvent extends Event<{ inputs: Record<string, unknown>; moduleId: string }> {}
