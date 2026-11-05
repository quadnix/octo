import type { ModelSerializedOutput } from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';

/**
 * The modules this app took from the states it extends. Their models, overlays and resources are
 * declared as the other app committed them: nothing of theirs runs, renders terraform, or changes here.
 *
 * @internal
 */
export class ImportService {
  private readonly moduleIds: Set<string> = new Set();

  private readonly modules: ModelSerializedOutput['modules'] = {};

  /**
   * Every imported module, by module id, as the state it came from records it.
   */
  getModules(): ModelSerializedOutput['modules'] {
    return { ...this.modules };
  }

  /**
   * Whether a module was imported rather than declared by this app.
   */
  isImportedModule(moduleId: string | undefined): boolean {
    return moduleId !== undefined && this.moduleIds.has(moduleId);
  }

  /**
   * Records the modules of one imported state: every module a node of it names, and the record of
   * each module it ran.
   */
  registerImport(moduleIds: string[], modules: ModelSerializedOutput['modules']): void {
    for (const moduleId of [...moduleIds, ...Object.keys(modules)]) {
      this.moduleIds.add(moduleId);
    }
    Object.assign(this.modules, modules);
  }

  /**
   * Forgets every import.
   */
  reset(): void {
    this.moduleIds.clear();
    for (const moduleId of Object.keys(this.modules)) {
      delete this.modules[moduleId];
    }
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
