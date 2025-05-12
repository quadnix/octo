import { HookEvent } from './hook.event.js';

/**
 * The ResourceActionHookEvent class is the superclass for all events emitting in relation to resource action hooks.
 *
 * @group Events
 * @returns The Event instance.
 */
export class ResourceActionHookEvent extends HookEvent {}

/**
 * This hook event is emitted when a post-resource action hook callback is done executing.
 *
 * @group Events
 * @returns The Event instance.
 */
export class PostResourceActionHookCallbackDoneEvent extends ResourceActionHookEvent {}

/**
 * This hook event is emitted when a pre-resource action hook callback is done executing.
 *
 * @group Events
 * @returns The Event instance.
 */
export class PreResourceActionHookCallbackDoneEvent extends ResourceActionHookEvent {}
