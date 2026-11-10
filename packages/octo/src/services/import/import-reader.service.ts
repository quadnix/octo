import {
  MatchingResource,
  type ModelSerializedOutput,
  type ResourceSerializedOutput,
  type UnknownModel,
  type UnknownOverlay,
} from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { ModuleError } from '../../errors/index.js';
import { Container } from '../../functions/container/container.js';
import type { ANode } from '../../functions/node/node.abstract.js';
import { ModuleContainer } from '../../modules/module.container.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { InputService } from '../input/input.service.js';
import { ModelSerializationService } from '../serialization/model/model-serialization.service.js';
import { ResourceSerializationService } from '../serialization/resource/resource-serialization.service.js';
import { type ImportStateFile, StateManagementService } from '../state-management/state-management.service.js';
import type { IStateProvider } from '../state-management/state-provider.interface.js';
import { ImportService } from './import.service.js';

/**
 * Reads the states this app extends and the stores it reads, and declares what they hold in this app.
 *
 * @internal
 */
export class ImportReaderService {
  private readonly extendedResourceData: Required<ResourceSerializedOutput> = {
    copiedResources: {},
    dependencies: [],
    resources: {},
  };

  private generatedImports?: ImportStateFile;

  private readonly importedOverlayContexts = new Map<string, string>(); // By app's context and state's context.

  private readonly importedStates: ImportStateFile = {};

  private packageVersions: { [packageName: string]: string } = {};

  private readonly storeResourceData: Required<ResourceSerializedOutput> = {
    copiedResources: {},
    dependencies: [],
    resources: {},
  };

  /**
   * @internal
   */
  constructor(
    private readonly importService: ImportService,
    private readonly inputService: InputService,
    private readonly modelSerializationService: ModelSerializationService,
    private readonly moduleContainer: ModuleContainer,
    private readonly overlayDataRepository: OverlayDataRepository,
    private readonly resourceDataRepository: ResourceDataRepository,
    private readonly resourceSerializationService: ResourceSerializationService,
    private readonly stateManagementService: StateManagementService,
  ) {}

  /**
   * Declares one state this app extends.
   */
  async extendState(stateProvider: IStateProvider): Promise<void> {
    if (this.moduleContainer.hasLoadedModules()) {
      throw new ModuleError('Cannot extend a state after loading a module!', 'extendState');
    }

    const extendedCount = Object.keys(this.importedStates).filter((key) => key.startsWith('extends:')).length;
    const {
      modelState: { data: modelData },
      resourceState: { data: resourceData },
    } = await this.readImportedState(`extends:${extendedCount}`, stateProvider);
    if (Object.keys(modelData.models).length === 0) {
      throw new ModuleError('Cannot extend a state that has sealed no models!', 'extendState');
    }

    await this.declareImportedStates([{ modelData, resourceData }]);
  }

  /**
   * The version of each package this app's classes come from, as registered.
   */
  getPackageVersions(): { [packageName: string]: string } {
    return { ...this.packageVersions };
  }

  /**
   * Reads every later import as this run's `generate` read it.
   */
  async readImportsAsGenerated(): Promise<void> {
    this.generatedImports = (await this.stateManagementService.getImportState()) ?? {};
  }

  /**
   * Declares every store, each under its name and frozen.
   */
  async readStores(stores: { name: string; stateProvider: IStateProvider }[]): Promise<void> {
    const states: { modelData: ModelSerializedOutput; name: string; resourceData: ResourceSerializedOutput }[] = [];
    for (const { name, stateProvider } of stores) {
      if (!/^[\w-]+$/.test(name)) {
        throw new ModuleError(`Store name "${name}" may hold only letters, digits, "_" and "-"!`, name);
      }
      if (states.some((state) => state.name === name)) {
        throw new ModuleError(`Store "${name}" is read twice!`, name);
      }

      const {
        modelState: { data: modelData },
        resourceState: { data: resourceData },
      } = await this.readImportedState(`stores:${name}`, stateProvider);
      if (Object.keys(modelData.models).length === 0) {
        throw new ModuleError(`Store "${name}" has sealed no models!`, name);
      }

      // Name every module of the store under the store.
      const storeModuleId = (moduleId: string): string => `${name}:${moduleId}`;
      for (const record of [
        ...Object.values(modelData.models),
        ...modelData.overlays,
        ...Object.values(resourceData.resources),
        ...Object.values(resourceData.copiedResources ?? {}),
      ]) {
        record.moduleId = storeModuleId(record.moduleId);
      }
      modelData.modules = Object.fromEntries(
        Object.entries(modelData.modules).map(([moduleId, module]) => [
          storeModuleId(moduleId),
          { ...module, inputs: this.nameReferencesUnderStore(module.inputs, name) },
        ]),
      );

      states.push({ modelData, name, resourceData });
    }

    await this.declareImportedStates(states);
  }

  /**
   * Records the version of each package this app's classes come from.
   */
  registerPackageVersions(packageVersions: { [packageName: string]: string }): void {
    this.packageVersions = { ...packageVersions };
  }

  /**
   * Deserializes this app's actual and old resource state, with every import read so far. This app's
   * resources are rebuilt from its own files, a store's parent from this app's copy of it, so they never
   * wait for a store. A resource of a state it extends, or of a store it reads, is read from that state.
   */
  async retrieveResourceState(): Promise<void> {
    // This app's saved copies of an extended state's resources stand in for any that state no longer holds.
    const load = ({ copiedResources, dependencies, resources }: ResourceSerializedOutput): ResourceSerializedOutput => {
      const isOwn = ([, { moduleId }]: [string, { moduleId: string }]): boolean =>
        !this.importService.isImportedModule(moduleId);
      return {
        copiedResources: {
          ...Object.fromEntries(Object.entries(resources).filter((entry) => !isOwn(entry))),
          ...copiedResources,
          ...this.extendedResourceData.copiedResources,
        },
        dependencies,
        resources: {
          ...Object.fromEntries(Object.entries(resources).filter(isOwn)),
          ...this.extendedResourceData.resources,
        },
      };
    };

    const [{ data: actualData }, { data: oldData }] = await Promise.all([
      this.stateManagementService.getResourceState(this.stateManagementService.actualResourceStateFileName),
      this.stateManagementService.getResourceState(this.stateManagementService.oldResourceStateFileName),
    ]);
    await this.resourceSerializationService.deserialize(load(actualData), load(oldData), {
      ...this.storeResourceData,
      copiedResources: {
        ...this.extendedResourceData.copiedResources,
        ...this.storeResourceData.copiedResources,
        ...this.extendedResourceData.resources,
      },
    });
  }

  /**
   * Saves every import read into `imports.json`, when there is one.
   */
  async saveImportState(): Promise<void> {
    if (Object.keys(this.importedStates).length > 0) {
      await this.stateManagementService.saveImportState(this.importedStates);
    }
  }

  /**
   * Declares the models, overlays, inputs and resources of imported states under the modules that
   * recorded them: one state this app extends, or every store at once, frozen. A node or resource
   * declared before, by an earlier state or an earlier store in the list, is declared once and shared,
   * so a state standing on another's nodes links to them.
   */
  private async declareImportedStates(
    states: { modelData: ModelSerializedOutput; name?: string; resourceData: ResourceSerializedOutput }[],
  ): Promise<void> {
    const isStore = states.some((state) => state.name !== undefined);

    // Take each node once, the first state holding it winning; a later state names it as an alias.
    const declaredNodes: { [context: string]: UnknownModel | UnknownOverlay } = Object.fromEntries(
      [...this.inputService.getModels(), ...this.overlayDataRepository.getByProperties()].map((node) => [
        node.getContext(),
        node,
      ]),
    );
    // An overlay's context holds nothing of its app, so overlays of two apps may share one. Each is told
    // apart by its app, and a store's is read under the store's name, every reference to it renamed.
    for (const { modelData: state, name, resourceData: resources } of states) {
      const appContext = Object.entries(state.models).find(([, m]) => m.nodeName === 'app')?.[0];
      const renamed = new Map<string, string>();
      for (const { context } of state.overlays) {
        const key = `${appContext}|${context}`;
        if (!this.importedOverlayContexts.has(key)) {
          this.importedOverlayContexts.set(key, name === undefined ? context : `${name}:${context}`);
        }
        renamed.set(context, this.importedOverlayContexts.get(key)!);
      }
      const rename = (context: string): string => renamed.get(context) ?? context;
      for (const overlay of state.overlays) {
        overlay.context = rename(overlay.context);
        for (const anchor of overlay.overlay.anchors) {
          anchor.parent.context = rename(anchor.parent.context);
        }
      }
      for (const anchor of state.anchors) {
        anchor.location.context = rename(anchor.location.context);
        anchor.parent.context = rename(anchor.parent.context);
      }
      for (const dependency of state.dependencies) {
        dependency.from = rename(dependency.from);
        dependency.to = rename(dependency.to);
      }
      for (const record of [...Object.values(resources.resources), ...Object.values(resources.copiedResources ?? {})]) {
        record.createdBy = record.createdBy === undefined ? undefined : rename(record.createdBy);
        record.models = record.models.map(rename);
      }
    }

    const modelData: ModelSerializedOutput = { anchors: [], dependencies: [], models: {}, modules: {}, overlays: [] };
    const modelAliases: { context: string; moduleId: string }[] = [];
    const overlayAliases: { context: string; moduleId: string }[] = [];
    const takenCounts: number[] = [];
    for (const { modelData: state } of states) {
      const taken = new Set<string>();
      for (const [context, model] of Object.entries(state.models)) {
        if (context in declaredNodes || context in modelData.models) {
          modelAliases.push({ context, moduleId: model.moduleId });
        } else {
          modelData.models[context] = model;
          taken.add(context);
        }
      }
      for (const overlay of state.overlays) {
        if (overlay.context in declaredNodes || modelData.overlays.some((o) => o.context === overlay.context)) {
          overlayAliases.push({ context: overlay.context, moduleId: overlay.moduleId });
        } else {
          modelData.overlays.push(overlay);
          taken.add(overlay.context);
        }
      }
      takenCounts.push(taken.size);

      modelData.anchors.push(...state.anchors.filter((a) => taken.has(a.location.context)));
      modelData.dependencies.push(...state.dependencies);
      modelData.modules = { ...state.modules, ...modelData.modules };
    }

    // Declare the models and overlays.
    const { models, overlays } = await this.modelSerializationService.deserializeImported(modelData, {
      declared: declaredNodes,
      freeze: isStore,
    });
    const getNode = (context: string): UnknownModel | UnknownOverlay | undefined =>
      models[context] ?? overlays[context] ?? declaredNodes[context];
    for (const [context, { moduleId }] of Object.entries(modelData.models)) {
      this.inputService.registerModel(moduleId, models[context]);
    }
    for (const { context, moduleId } of modelData.overlays) {
      this.overlayDataRepository.add(overlays[context]);
      this.inputService.registerOverlay(moduleId, overlays[context]);
    }
    for (const { context, moduleId } of modelAliases) {
      const model = getNode(context) as UnknownModel;
      if (this.inputService.resolve(`${moduleId}.model.${(model.constructor as typeof ANode).NODE_NAME}`) !== model) {
        this.inputService.registerModel(moduleId, model);
      }
    }
    for (const { context, moduleId } of overlayAliases) {
      const overlay = getNode(context) as UnknownOverlay;
      if (this.inputService.resolve(`${moduleId}.overlay.${overlay.overlayId}`) === undefined) {
        this.inputService.registerOverlay(moduleId, overlay);
      }
    }

    // Declare what each module was given, so a reference to an imported module's input reads it.
    for (const [moduleId, { inputs }] of Object.entries(modelData.modules)) {
      for (const [key, value] of Object.entries(inputs)) {
        if (this.inputService.resolve(`${moduleId}.input.${key}`) === undefined) {
          this.inputService.registerInput(moduleId, key, JSON.parse(JSON.stringify(value)));
        }
      }
    }

    // Take each resource once, as the nodes above.
    const declaredResources = Object.fromEntries(
      this.resourceDataRepository.getNewResourcesByProperties().map((r) => [r.getContext(), r]),
    );
    const resourceData: Required<ResourceSerializedOutput> = { copiedResources: {}, dependencies: [], resources: {} };
    const resourceAliases: { context: string; moduleId: string }[] = [];
    for (const [i, { name, resourceData: state }] of states.entries()) {
      for (const [context, record] of Object.entries(state.resources)) {
        if (context in declaredResources || context in resourceData.resources) {
          resourceAliases.push({ context, moduleId: record.moduleId });
        } else {
          resourceData.resources[context] = record;
          takenCounts[i]++;
        }
      }
      resourceData.dependencies.push(...state.dependencies);
      resourceData.copiedResources = { ...state.copiedResources, ...resourceData.copiedResources };

      if (name !== undefined && takenCounts[i] === 0) {
        throw new ModuleError(`Store "${name}" holds nothing that is not already read!`, name);
      }
    }

    // Record each state, every module id it names, aliases included.
    for (const { modelData: state, name, resourceData: resources } of states) {
      const moduleIds = [
        ...Object.values(state.models).map((m) => m.moduleId),
        ...state.overlays.map((o) => o.moduleId),
        ...Object.values(resources.resources).map((r) => r.moduleId),
      ];
      const modules = Object.fromEntries(Object.entries(modelData.modules).filter(([id]) => id in state.modules));
      if (name === undefined) {
        this.importService.registerExtendedState(moduleIds, modules);
      } else {
        this.importService.registerStore(name, moduleIds, modules);
      }
    }

    // Reload the actual and old resource state with these resources, then declare them in the new one.
    const importedResourceData = isStore ? this.storeResourceData : this.extendedResourceData;
    Object.assign(importedResourceData.resources, resourceData.resources);
    importedResourceData.copiedResources = { ...resourceData.copiedResources, ...importedResourceData.copiedResources };
    await this.replaceImportedResourceState();

    const resources = await this.resourceSerializationService.deserializeImported(resourceData, declaredResources);

    // A resource declared before stood on its state's copy of a resource only now read; move it onto this one.
    for (const declaredResource of Object.values(declaredResources)) {
      for (const parent of declaredResource.parents.map((p) => (p instanceof MatchingResource ? p.getActual() : p))) {
        const replacement = resources[parent.getContext()];
        if (replacement && replacement !== parent) {
          declaredResource.replaceParent(parent, replacement);
        }
      }
    }
    for (const [context, { createdBy, models: modelContexts, moduleId }] of Object.entries(resourceData.resources)) {
      const resource = resources[context];
      this.resourceDataRepository.addNewResource(resource);

      this.inputService.registerResource(moduleId, resource, createdBy === undefined ? undefined : getNode(createdBy));
      for (const node of modelContexts.map(getNode)) {
        if (node) {
          this.inputService.registerResourceModel(resource, node);
        }
      }
    }
    for (const { context, moduleId } of resourceAliases) {
      const resource = declaredResources[context] ?? resources[context];
      if (this.inputService.resolve(`${moduleId}.resource.${resource.localResourceId}`) === undefined) {
        this.inputService.registerResource(moduleId, resource);
      }
    }
  }

  /**
   * Names every `${{<moduleId>.…}}` reference a store's module was given under the store, as its
   * modules are.
   */
  private nameReferencesUnderStore(inputs: { [key: string]: unknown }, name: string): { [key: string]: unknown } {
    return JSON.parse(
      JSON.stringify(inputs).replace(
        /\$\{\{\s*([^.\s}:]+)\./g,
        (_reference, moduleId: string) => `\${{${name}:${moduleId}.`,
      ),
    );
  }

  /**
   * Reads one imported state: as this run's `generate` read it once {@link readImportsAsGenerated}
   * was called, otherwise its newest sealed state. Keeps a copy for `generate` to record.
   */
  private async readImportedState(importKey: string, stateProvider: IStateProvider): Promise<ImportStateFile[string]> {
    const importedState =
      this.generatedImports?.[importKey] ?? (await new StateManagementService(stateProvider).getSealedState());

    // A state is read only in this octo's state version.
    const importName = importKey.startsWith('stores:')
      ? `Store "${importKey.slice('stores:'.length)}"`
      : 'Extended state';
    this.stateManagementService.assertStateVersion(importName, importedState.modelState.userData.version);
    this.stateManagementService.assertStateVersion(importName, importedState.resourceState.userData.version);

    // A class reads another app's state as its own version saved it, so both must run one version.
    for (const [packageName, version] of Object.entries(importedState.modelState.userData.packageVersions ?? {})) {
      const ownVersion = this.packageVersions[packageName];
      if (ownVersion !== undefined && ownVersion !== version) {
        throw new ModuleError(
          `${importName} was generated on "${packageName}" ${version}, this app runs ${ownVersion}; generate it again on ${ownVersion}!`,
          importKey,
        );
      }
    }

    this.importedStates[importKey] = JSON.parse(JSON.stringify(importedState));
    return importedState;
  }

  /**
   * Reloads the actual and the old resource state with every import read so far, so an imported
   * resource never differs from the state it was read from. What an earlier import declared is kept.
   */
  private async replaceImportedResourceState(): Promise<void> {
    const declaredResources = this.resourceDataRepository.getNewResourcesByProperties();
    await this.retrieveResourceState();
    for (const resource of declaredResources) {
      this.resourceDataRepository.addNewResource(resource);
    }
  }
}

/**
 * @internal
 */
@Factory<ImportReaderService>(ImportReaderService)
export class ImportReaderServiceFactory {
  private static instance: ImportReaderService;

  /**
   * @internal
   *
   * @param forceNew Builds a reader that has read nothing, on the services as they stand now.
   */
  static async create(forceNew: boolean = false): Promise<ImportReaderService> {
    if (!this.instance || forceNew) {
      const container = Container.getInstance();
      const [
        importService,
        inputService,
        modelSerializationService,
        moduleContainer,
        overlayDataRepository,
        resourceDataRepository,
        resourceSerializationService,
        stateManagementService,
      ] = await Promise.all([
        container.get(ImportService),
        container.get(InputService),
        container.get(ModelSerializationService),
        container.get(ModuleContainer),
        container.get(OverlayDataRepository),
        container.get(ResourceDataRepository),
        container.get(ResourceSerializationService),
        container.get(StateManagementService),
      ]);
      this.instance = new ImportReaderService(
        importService,
        inputService,
        modelSerializationService,
        moduleContainer,
        overlayDataRepository,
        resourceDataRepository,
        resourceSerializationService,
        stateManagementService,
      );
    }

    return this.instance;
  }
}
