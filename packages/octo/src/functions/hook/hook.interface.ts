export interface IHook<PreHookSignature, PostHookSignature> {
  collectHooks(hooks: { postHooks?: PostHookSignature[]; preHooks?: PreHookSignature[] }): void;

  registrar(PropertyDescriptor): void;

  reset(): void;
}
