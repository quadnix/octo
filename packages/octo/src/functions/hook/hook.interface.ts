import type { IUnknownModelAction, IUnknownResourceAction } from '../../app.type.js';

/**
 * @internal
 */
export interface IHook<PreHookSignature, PostHookSignature> {
  collectHooks(hooks: { postHooks?: PostHookSignature[]; preHooks?: PreHookSignature[] }): void;

  registrar(descriptor: PropertyDescriptor | IUnknownModelAction | IUnknownResourceAction): void;

  reset(): void;
}
