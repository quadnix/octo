import { strict as assert } from 'assert';
import type { ModuleSchema, UnknownModel } from '../app.type.js';
import type { CommitHook } from '../functions/hook/commit.hook.js';
import type { ModelActionHook } from '../functions/hook/model-action.hook.js';
import type { ResourceActionHook } from '../functions/hook/resource-action.hook.js';
import type { IModule } from './module.interface.js';

/**
 * The base class of every module - the unit you actually assemble infrastructure from.
 *
 * A module takes typed inputs, and produces models, overlays, and anchors. It is the reusable piece:
 * you publish one, someone else loads it with {@link Octo.loadModule} and their own inputs, and the
 * models it built become available to the modules that run after it.
 *
 * Everything a module needs from another module it finds by schema - see
 * {@link AModel.getAnchorsMatchingSchema} - so modules compose without importing each other's classes.
 *
 * @example
 * ```ts
 * @Module<MyModule>('@example', MyModuleSchema)
 * export class MyModule extends AModule<MyModuleSchema, MyRegion> {
 *   async onInit(inputs: MyModuleSchema): Promise<MyRegion> { ... }
 * }
 * ```
 *
 * @group Modules
 *
 * @see Definition of [Modules](/docs/fundamentals/modules).
 */
export abstract class AModule<S, T extends UnknownModel> implements IModule<S, T> {
  static readonly MODULE_PACKAGE: string;

  static readonly MODULE_SCHEMA: ModuleSchema<AModule<any, any>>;

  /**
   * The ID this module was loaded under. It scopes everything the module produces, so the same
   * module class can be loaded more than once.
   */
  readonly moduleId: string;

  /**
   * @param moduleId The ID this module is loaded under.
   */
  constructor(moduleId: string) {
    this.moduleId = moduleId;
  }

  /**
   * Builds this module's infrastructure. It is where you construct models, attach anchors,
   * and create overlays.
   *
   * Validate inputs here and throw a [ModuleError](/api/octo/class/ModuleError) on anything you
   * cannot satisfy - failing in `onInit` costs nothing, while failing later costs a half-built stack.
   *
   * @param inputs The inputs this module was loaded with, already validated against its schema.
   * @returns The nodes this module produced. Return them all, including overlays - they are what
   * later modules resolve against.
   */
  abstract onInit(inputs: S): Promise<T | UnknownModel[]>;

  /**
   * To hook custom behavior into Octo's lifecycle for the duration of this module.
   * Override it to return the callbacks you want run.
   *
   * @see Techniques for [Hooks](/docs/techniques/hooks).
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
   * To derive values that both {@link AModule.onInit} and this module's actions need - typically
   * facts resolved from another module's anchors, such as an account ID or a region's availability
   * zones. Override it, and the returned object is handed to every action of this module as
   * `actionInputs.metadata`.
   *
   * @param inputs The inputs this module was loaded with.
   */
  async registerMetadata(inputs: S): Promise<Record<string, unknown>> {
    assert(!!inputs);
    return {};
  }
}
