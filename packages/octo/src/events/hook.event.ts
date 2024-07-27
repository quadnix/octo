import { Event } from './event.model.js';

export class HookEvent extends Event<void> {}

export class CommitHookEvent extends HookEvent {}

export class ModelActionHookEvent extends HookEvent {}

export class ResourceActionHookEvent extends HookEvent {}

export class CommitHookCallbackDoneEvent extends CommitHookEvent {}

export class ModelActionHookCallbackDoneEvent extends ModelActionHookEvent {}

export class ResourceActionHookCallbackDoneEvent extends ResourceActionHookEvent {}

export class PostCommitHookCallbackDoneEvent extends CommitHookEvent {}

export class PostModelActionHookCallbackDoneEvent extends ModelActionHookEvent {}

export class PostResourceActionHookCallbackDoneEvent extends ResourceActionHookEvent {}

export class PreCommitHookCallbackDoneEvent extends CommitHookEvent {}

export class PreModelActionHookCallbackDoneEvent extends ModelActionHookEvent {}

export class PreResourceActionHookCallbackDoneEvent extends ResourceActionHookEvent {}
