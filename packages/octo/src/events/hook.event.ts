import { Event } from './event.model.js';

/**
 * The HookEvent class is the superclass for all events emitting in relation to hooks.
 *
 * :::warning Warning
 * It is not a good practice to create an event from this class directly,
 * but should rather create one from one of the subclasses.
 * This promotes a more accurate classification of events.
 * :::
 *
 * @example
 * ```ts
 * const myEvent = new HookEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class HookEvent extends Event<void> {}

/**
 * The CommitHookEvent class is the superclass for all events emitting in relation to commit hooks.
 *
 * :::warning Warning
 * It is not a good practice to create an event from this class directly,
 * but should rather create one from one of the subclasses.
 * This promotes a more accurate classification of events.
 * :::
 *
 * @example
 * ```ts
 * const myEvent = new CommitHookEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class CommitHookEvent extends HookEvent {}

/**
 * The ModelActionHookEvent class is the superclass for all events emitting in relation to model action hooks.
 *
 * :::warning Warning
 * It is not a good practice to create an event from this class directly,
 * but should rather create one from one of the subclasses.
 * This promotes a more accurate classification of events.
 * :::
 *
 * @example
 * ```ts
 * const myEvent = new ModelActionHookEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ModelActionHookEvent extends HookEvent {}

/**
 * The ResourceActionHookEvent class is the superclass for all events emitting in relation to resource action hooks.
 *
 * :::warning Warning
 * It is not a good practice to create an event from this class directly,
 * but should rather create one from one of the subclasses.
 * This promotes a more accurate classification of events.
 * :::
 *
 * @example
 * ```ts
 * const myEvent = new ResourceActionHookEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ResourceActionHookEvent extends HookEvent {}

/**
 * This hook event is emitted when the base decorated method is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new CommitHookCallbackDoneEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class CommitHookCallbackDoneEvent extends CommitHookEvent {}

/**
 * This hook event is emitted when the base decorated method is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new ModelActionHookCallbackDoneEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ModelActionHookCallbackDoneEvent extends ModelActionHookEvent {}

/**
 * This hook event is emitted when the base decorated method is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new ResourceActionHookCallbackDoneEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class ResourceActionHookCallbackDoneEvent extends ResourceActionHookEvent {}

/**
 * This hook event is emitted when a post-commit hook callback is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new PostCommitHookCallbackDoneEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class PostCommitHookCallbackDoneEvent extends CommitHookEvent {}

/**
 * This hook event is emitted when a post-model action hook callback is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new PostModelActionHookCallbackDoneEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class PostModelActionHookCallbackDoneEvent extends ModelActionHookEvent {}

/**
 * This hook event is emitted when a post-resource action hook callback is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new PostResourceActionHookCallbackDoneEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class PostResourceActionHookCallbackDoneEvent extends ResourceActionHookEvent {}

/**
 * This hook event is emitted when a pre-commit hook callback is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new PreCommitHookCallbackDoneEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class PreCommitHookCallbackDoneEvent extends CommitHookEvent {}

/**
 * This hook event is emitted when a pre-model action hook callback is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new PreModelActionHookCallbackDoneEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class PreModelActionHookCallbackDoneEvent extends ModelActionHookEvent {}

/**
 * This hook event is emitted when a pre-resource action hook callback is done executing.
 *
 * @example
 * ```ts
 * const myEvent = new PreResourceActionHookCallbackDoneEvent();
 * EventService.getInstance().emit(myEvent);
 * ```
 * @group Events
 * @returns The Event instance.
 */
export class PreResourceActionHookCallbackDoneEvent extends ResourceActionHookEvent {}
