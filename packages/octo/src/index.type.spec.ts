import type {
  DiffAction,
  ExternalResourceStateFile,
  IDependency,
  ModelSerializedOutput,
  ModelStateFile,
  ResourceSerializedOutput,
  ResourceStateFile,
  ServiceType,
} from './index.type.js';

/**
 * True when `T` is data a file can hold: no function anywhere in it, so no class instance either.
 */
type IsPlain<T> = T extends (...args: never[]) => unknown
  ? false
  : T extends readonly (infer E)[]
    ? IsPlain<E>
    : T extends object
      ? { [K in keyof T]-?: IsPlain<T[K]> }[keyof T] extends true
        ? true
        : false
      : true;

describe('Index Type UT', () => {
  it('should publish only plain data', () => {
    const checks: boolean[] = [
      false satisfies IsPlain<{ node: { getContext(): string } }>,
      true satisfies IsPlain<DiffAction>,
      true satisfies IsPlain<ExternalResourceStateFile>,
      true satisfies IsPlain<IDependency>,
      true satisfies IsPlain<ModelSerializedOutput>,
      true satisfies IsPlain<ModelStateFile>,
      true satisfies IsPlain<ResourceSerializedOutput>,
      true satisfies IsPlain<ResourceStateFile>,
      true satisfies IsPlain<ServiceType>,
    ];

    expect(checks).toEqual([false, true, true, true, true, true, true, true, true]);
  });
});
