import { HookEvent } from './hook.event.js';

/**
 * The ModelActionHookEvent class is the superclass for all events emitting in relation to model action hooks.
 *
 * @group Events/Hooks/Model
 */
export abstract class ModelActionHookEvent extends HookEvent {}

/**
 * This hook event is emitted when a post-model action hook callback is done executing.
 *
 * @group Events/Hooks/Model
 */
export class PostModelActionHookCallbackDoneEvent extends ModelActionHookEvent {}

/**
 * This hook event is emitted when a pre-model action hook callback is done executing.
 *
 * @group Events/Hooks/Model
 */
export class PreModelActionHookCallbackDoneEvent extends ModelActionHookEvent {}
