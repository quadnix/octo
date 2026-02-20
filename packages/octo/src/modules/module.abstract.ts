import { strict as assert } from 'assert';
import type { ModuleSchema, UnknownModel } from '../app.type.js';
import type { CommitHook } from '../functions/hook/commit.hook.js';
import type { ModelActionHook } from '../functions/hook/model-action.hook.js';
import type { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
import type { IModule } from './module.interface.js';

/**
 * The abstract base class for all Octo modules.
 *
 * A module is the top-level unit of infrastructure work in Octo.
 * It wraps models, overlays, resources, anchors, factories, and utilities
 * for a single cohesive piece of infrastructure (e.g. "add an AWS region").
 * Modules are registered with {@link Octo.loadModule} and executed in
 * declaration order during {@link Octo.compose}.
 *
 * To create a custom module, extend this class and apply the {@link Module} decorator:
 * ```ts
 * @Module('@my-package', MyModuleSchema)
 * export class MyModule extends AModule<MyModuleSchema, MyModel> {
 *   async onInit(inputs: MyModuleSchema): Promise<MyModel> {
 *     const model = new MyModel(inputs.modelId);
 *     return model;
 *   }
 * }
 * ```
 *
 * @group Modules
 * @see {@link Module} decorator
 * @see [Fundamentals: Modules](/docs/fundamentals/modules)
 */
export abstract class AModule<S, T extends UnknownModel> implements IModule<S, T> {
  static readonly MODULE_PACKAGE: string;

  static readonly MODULE_SCHEMA: ModuleSchema<AModule<any, any>>;

  readonly moduleId: string;

  constructor(moduleId: string) {
    this.moduleId = moduleId;
  }

  /**
   * The module entry point called by Octo during {@link Octo.compose}.
   *
   * Implement this method to build and return the primary model (or a list of
   * models) that this module owns. The returned model is added to the model
   * graph and becomes the root for all resources created by this module's actions.
   *
   * @param inputs The validated module schema inputs supplied via {@link Octo.loadModule}.
   * @returns The primary model, or an ordered list of models, managed by this module.
   */
  abstract onInit(inputs: S): Promise<T | UnknownModel[]>;

  /**
   * Registers lifecycle hooks for this module.
   *
   * Override this method to attach pre/post hooks that run around model actions,
   * resource actions, or commit events produced by this module.
   * The base implementation returns an empty object (no hooks).
   *
   * @returns An object with optional pre/post hook arrays for each hook type.
   */
  registerHooks(): {
    postCommitHooks?: Parameters<CommitHook['collectHooks']>[0]['postHooks'];
    postModelActionHooks?: Parameters<ModelActionHook['collectHooks']>[0]['postHooks'];
    postResourceActionHooks?: Parameters<ResourceActionHook['collectHooks']>[0]['postHooks'];
    preCommitHooks?: Parameters<CommitHook['collectHooks']>[0]['preHooks'];
    preModelActionHooks?: Parameters<ModelActionHook['collectHooks']>[0]['preHooks'];
    preResourceActionHooks?: Parameters<ResourceActionHook['collectHooks']>[0]['preHooks'];
  } {
    return {};
  }

  /**
   * Produces arbitrary metadata for this module.
   *
   * Override this method to emit key-value metadata associated with a module run
   * (e.g. for logging, auditing, or reporting). The metadata is available to
   * `CommitHook` consumers. The base implementation returns an empty object.
   *
   * @param inputs The same validated module schema inputs passed to {@link AModule.onInit}.
   * @returns A plain key-value metadata record.
   */
  async registerMetadata(inputs: S): Promise<Record<string, unknown>> {
    assert(!!inputs);
    return {};
  }
}
