import type { ModelSerializedOutput } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';

/**
 * What one state this app read brings: every module its models, overlays and resources name, and the
 * record of each module it ran.
 */
interface IImportedState {
  moduleIds: Set<string>;
  modules: ModelSerializedOutput['modules'];
}

/**
 * The modules this app took from the states it extends and the stores it reads. Their models, overlays
 * and resources are declared as the other app committed them: nothing of theirs runs, renders
 * terraform, or changes here.
 *
 * @internal
 */
export class ImportService {
  private readonly extendedStates: IImportedState[] = [];

  private readonly stores: Map<string, IImportedState> = new Map();

  /**
   * Every module of every extended state, by module id, as that state records it.
   */
  getExtendedModules(): ModelSerializedOutput['modules'] {
    return Object.assign({}, ...this.extendedStates.map((s) => s.modules));
  }

  /**
   * Every module of every store, by module id, as that store records it.
   */
  getStoreModules(): ModelSerializedOutput['modules'] {
    return Object.assign({}, ...[...this.stores.values()].map((s) => s.modules));
  }

  /**
   * The name of the store a module came from.
   */
  getStoreName(moduleId: string | undefined): string | undefined {
    return [...this.stores].find(([, s]) => moduleId !== undefined && s.moduleIds.has(moduleId))?.[0];
  }

  /**
   * Whether a store of this name is read.
   */
  hasStore(name: string): boolean {
    return this.stores.has(name);
  }

  /**
   * Whether a module came from a state this app extends.
   */
  isExtendedModule(moduleId: string | undefined): boolean {
    return moduleId !== undefined && this.extendedStates.some((s) => s.moduleIds.has(moduleId));
  }

  /**
   * Whether a module came from a state this app extends or a store it reads, rather than from this app.
   */
  isImportedModule(moduleId: string | undefined): boolean {
    return this.isExtendedModule(moduleId) || this.isStoreModule(moduleId);
  }

  /**
   * Whether a module came from a store.
   */
  isStoreModule(moduleId: string | undefined): boolean {
    return this.getStoreName(moduleId) !== undefined;
  }

  /**
   * Records one state this app extends.
   */
  registerExtendedState(moduleIds: string[], modules: ModelSerializedOutput['modules']): void {
    this.extendedStates.push({ moduleIds: new Set([...moduleIds, ...Object.keys(modules)]), modules });
  }

  /**
   * Records one store, its module ids already named under the store.
   */
  registerStore(name: string, moduleIds: string[], modules: ModelSerializedOutput['modules']): void {
    this.stores.set(name, { moduleIds: new Set([...moduleIds, ...Object.keys(modules)]), modules });
  }

  /**
   * Forgets every import.
   */
  reset(): void {
    this.extendedStates.splice(0);
    this.stores.clear();
  }
}

/**
 * @internal
 */
@Factory<ImportService>(ImportService)
export class ImportServiceFactory {
  private static instance: ImportService;

  /**
   * @internal
   */
  static async create(forceNew: boolean = false): Promise<ImportService> {
    if (!this.instance) {
      this.instance = new ImportService();
    }

    if (forceNew) {
      this.instance.reset();
    }

    return this.instance;
  }
}
