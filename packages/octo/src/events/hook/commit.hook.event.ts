import { HookEvent } from './hook.event.js';

/**
 * The CommitHookEvent class is the superclass for all events emitting in relation to commit hooks.
 *
 * @group Events
 * @returns The Event instance.
 */
export class CommitHookEvent extends HookEvent {}

/**
 * This hook event is emitted when a post-commit hook callback is done executing.
 *
 * @group Events
 * @returns The Event instance.
 */
export class PostCommitHookCallbackDoneEvent extends CommitHookEvent {}

/**
 * This hook event is emitted when a pre-commit hook callback is done executing.
 *
 * @group Events
 * @returns The Event instance.
 */
export class PreCommitHookCallbackDoneEvent extends CommitHookEvent {}
