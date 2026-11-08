import {
  type ActionOutputs,
  MatchingResource,
  type ResourceSerializedOutput,
  type UnknownResource,
} from '../../../app.type.js';
import { EventSource } from '../../../decorators/event-source.decorator.js';
import { Factory } from '../../../decorators/factory.decorator.js';
import { NodeUnsynthError, ResourceError } from '../../../errors/index.js';
import {
  ActualResourceSerializedEvent,
  NewResourceSerializedEvent,
  ResourceDeserializedEvent,
  ResourceRegistrationEvent,
} from '../../../events/index.js';
import { Container } from '../../../functions/container/container.js';
import type { IDependency } from '../../../functions/dependency/dependency.js';
import {
  ResourceDataRepository,
  type ResourceDataRepositoryFactory,
} from '../../../resources/resource-data.repository.js';
import type { AResource } from '../../../resources/resource.abstract.js';
import { ATerraformResource } from '../../../resources/terraform-resource.abstract.js';
import { ObjectUtility } from '../../../utilities/object/object.utility.js';
import { UnloadedNodeUtility } from '../../../utilities/unloaded-node/unloaded-node.utility.js';
import { ImportService } from '../../import/import.service.js';
import { InputService } from '../../input/input.service.js';

/**
 * @internal
 */
export class ResourceSerializationService {
  private actualResources = new Map<string, { createdBy?: string; models: string[]; moduleId: string }>(); // Resource context -> record in state.
  private readonly classMapping: { [key: string]: any } = {};

  private copiedResourceRecords = new Map<string, ResourceSerializedOutput['resources'][string]>(); // Resource context -> copy in state.
  private readonly RESOURCE_DESERIALIZATION_TIMEOUT_IN_MS = 3000;

  /**
   * @internal
   */
  constructor(
    private readonly resourceDataRepository: ResourceDataRepository,
    private readonly importService: ImportService,
    private readonly inputService: InputService,
  ) {}

  /**
   * @internal
   */
  @EventSource(ResourceDeserializedEvent)
  async deserialize(
    actualSerializedOutput: ResourceSerializedOutput,
    oldSerializedOutput: ResourceSerializedOutput,
    storeSerializedOutput: ResourceSerializedOutput = { dependencies: [], resources: {} },
  ): Promise<void> {
    // A store's resources are rebuilt apart from this app's, which build on their own copies of them.
    const storeResources = (freeze: boolean): Promise<ActionOutputs> =>
      this._deserialize(JSON.parse(JSON.stringify(storeSerializedOutput)), freeze, { imported: true });
    const actualResources = {
      ...(await this._deserialize(JSON.parse(JSON.stringify(actualSerializedOutput)), false)),
      ...(await storeResources(false)),
    };
    const oldResources = {
      ...(await this._deserialize(JSON.parse(JSON.stringify(oldSerializedOutput)), true)),
      ...(await storeResources(true)),
    };

    this.actualResources = new Map(
      [actualSerializedOutput, storeSerializedOutput]
        .flatMap(({ resources }) => Object.entries(resources))
        .map(([context, { createdBy, models, moduleId }]) => [context, { createdBy, models, moduleId }]),
    );
    this.copiedResourceRecords = new Map(
      [actualSerializedOutput, oldSerializedOutput, storeSerializedOutput].flatMap(({ copiedResources = {} }) =>
        Object.entries(copiedResources),
      ),
    );

    // Refresh the resource data repository.
    await Container.getInstance().get<ResourceDataRepository, typeof ResourceDataRepositoryFactory>(
      ResourceDataRepository,
      {
        args: [true, Object.values(actualResources), Object.values(oldResources), []],
      },
    );
  }

  /**
   * Reads other apps' resources, unfrozen, so this app's resources build on them. A parent `declared`
   * holds is linked to; one neither holds is built from that app's copy of it. A class this app does
   * not import is read as a stand-in.
   *
   * @param declared The resources already declared, by context.
   */
  async deserializeImported(
    serializedOutput: ResourceSerializedOutput,
    declared: ActionOutputs = {},
  ): Promise<ActionOutputs> {
    return this._deserialize(JSON.parse(JSON.stringify(serializedOutput)), false, { declared, imported: true });
  }

  /**
   * The module that produced a committed resource, as the state it was loaded from records it.
   */
  getActualResourceModuleId(resource: UnknownResource): string | undefined {
    return this.actualResources.get(resource.getContext())?.moduleId;
  }

  /**
   * @internal
   */
  @EventSource(ResourceRegistrationEvent)
  registerClass(className: string, deserializationClass: any): void {
    if (this.classMapping[className]) {
      throw new Error(`Class "${className}" is already registered!`);
    }
    this.classMapping[className] = deserializationClass;
  }

  /**
   * @internal
   */
  @EventSource(ActualResourceSerializedEvent)
  async serializeActualResources(): Promise<ResourceSerializedOutput> {
    const resources = this.resourceDataRepository.getActualResourcesByProperties();
    return this.serialize(resources);
  }

  /**
   * @internal
   */
  @EventSource(NewResourceSerializedEvent)
  async serializeNewResources(): Promise<ResourceSerializedOutput> {
    const resources = this.resourceDataRepository.getNewResourcesByProperties();
    return this.serialize(resources);
  }

  /**
   * @internal
   */
  private async _deserialize(
    { copiedResources = {}, resources }: ResourceSerializedOutput,
    freeze: boolean,
    { declared, imported = false }: { declared?: ActionOutputs; imported?: boolean } = {},
  ): Promise<ActionOutputs> {
    // A parent the graph does not hold is built from its copy, which is never returned.
    const records = Object.fromEntries(
      Object.entries({ ...copiedResources, ...resources }).filter(([context]) => !declared?.[context]),
    );
    for (const [context, { className, resource }] of Object.entries(records)) {
      const unread = resource.parents.find((p) => !(p.context in records) && !declared?.[p.context]);
      if (unread) {
        throw new NodeUnsynthError(
          `Resource "${context}" links to "${unread.context}", which no state read holds!`,
          className,
        );
      }
    }

    const deReferencePromises: {
      [p: string]: [Promise<boolean>, (value: boolean) => void, (error: Error) => void, NodeJS.Timeout];
    } = {};
    const seen: ActionOutputs = { ...declared };

    const deReferenceResource = async (context: string): Promise<UnknownResource> => {
      if (!seen[context]) {
        if (deReferencePromises[context]) {
          await deReferencePromises[context][0];
        } else {
          deReferencePromises[context] = [] as any;
          const promise = new Promise<boolean>((resolve, reject) => {
            deReferencePromises[context][1] = resolve;
            deReferencePromises[context][2] = reject;
          });
          deReferencePromises[context][0] = promise;

          deReferencePromises[context][3] = setTimeout(() => {
            deReferencePromises[context][2](new Error('DeReferencing resource operation timed out!'));
          }, this.RESOURCE_DESERIALIZATION_TIMEOUT_IN_MS);
          await promise;
        }
      }

      return seen[context];
    };

    const deserializeResource = async (context: string): Promise<UnknownResource> => {
      const { className, moduleId, resource } = records[context];
      // Another app's resource, or this app's copy of one, may be of a class this app does not import.
      const deserializationClass =
        this.classMapping[className] ??
        (imported || !(context in resources) || this.importService.isImportedModule(moduleId)
          ? UnloadedNodeUtility.resourceClass(
              className,
              context.slice(context.lastIndexOf('/', context.indexOf('=')) + 1, context.indexOf('=')),
            )
          : undefined);
      if (!deserializationClass) {
        throw new NodeUnsynthError(
          `Class "${className}" of module "${moduleId}" is not registered! Import its module, or define a class of that name.`,
          className,
        );
      }

      const deserializedResource = await deserializationClass.unSynth(
        deserializationClass,
        resource,
        deReferenceResource,
      );
      deserializedResource['context'] = context;

      seen[context] = deserializedResource;
      if (deReferencePromises[context]) {
        deReferencePromises[context][1](true);
        clearTimeout(deReferencePromises[context][3]);
      }

      return deserializedResource;
    };

    // Deserialize all serialized resources.
    const promiseToDeserializeResources: Promise<UnknownResource>[] = [];
    for (const context of Object.keys(records)) {
      promiseToDeserializeResources.push(deserializeResource(context));
    }
    await Promise.all(promiseToDeserializeResources);

    if (freeze) {
      for (const resource of Object.values(seen)) {
        ObjectUtility.deepFreeze(resource);
      }
    }

    return Object.fromEntries(Object.entries(seen).filter(([context]) => context in records && context in resources));
  }

  /**
   * @internal
   */
  private async serialize(resources: UnknownResource[]): Promise<ResourceSerializedOutput> {
    const dependencies: IDependency[] = [];
    const serializedResources: ResourceSerializedOutput['resources'] = {};
    const copiedResources: ResourceSerializedOutput['resources'] = {};

    // Take the module, creator and models of a resource this command did not produce from the state it was loaded from.
    const serializeResource = (resource: UnknownResource): ResourceSerializedOutput['resources'][string] => {
      const loadedResource =
        this.actualResources.get(resource.getContext()) ?? this.copiedResourceRecords.get(resource.getContext());
      const moduleId = this.inputService.getModuleIdFromResource(resource) ?? loadedResource?.moduleId;
      if (moduleId === undefined) {
        throw new ResourceError('Resource is not associated with any module!', resource);
      }
      const createdBy = this.inputService.getCreatorFromResource(resource) ?? loadedResource?.createdBy;
      const models = this.inputService.getModelsFromResource(resource);

      return {
        className:
          UnloadedNodeUtility.getUnloadedClassName(resource) ??
          `${(resource.constructor as typeof AResource).NODE_PACKAGE}/${resource.constructor.name}`,
        ...(createdBy === undefined ? {} : { createdBy }),
        kind:
          resource instanceof ATerraformResource
            ? 'terraform'
            : (this.copiedResourceRecords.get(resource.getContext())?.kind ?? 'external'),
        models: models.length > 0 ? models : (loadedResource?.models ?? []),
        moduleId,
        resource: resource.synth(),
      };
    };

    // Save this app's own resources.
    const savedResources = resources
      .sort((a, b) => a.getContext().localeCompare(b.getContext()))
      .filter(
        (resource) =>
          !resource.isMarkedDeleted() &&
          !this.importService.isStoreModule(this.inputService.getModuleIdFromResource(resource)),
      );
    for (const resource of savedResources) {
      const resourceDependencies = resource
        .getDependencies()
        .map((d) => d.synth())
        .sort((a, b) => (a.from + a.to > b.from + b.to ? 1 : b.from + b.to > a.from + a.to ? -1 : 0));
      dependencies.push(...resourceDependencies);

      serializedResources[resource.getContext()] = serializeResource(resource);
    }

    // Copy every parent not saved as this app's own, such as a store's, and its parents in turn.
    const parentsToCopy = savedResources.flatMap((r) => r.parents);
    while (parentsToCopy.length > 0) {
      const parent = parentsToCopy.shift()!;
      const resource = parent instanceof MatchingResource ? parent.getActual() : parent;
      const context = resource.getContext();
      if (context in serializedResources || context in copiedResources) {
        continue;
      }

      copiedResources[context] = serializeResource(resource);
      parentsToCopy.push(...resource.parents);
    }

    return {
      dependencies,
      resources: serializedResources,
      ...(Object.keys(copiedResources).length === 0
        ? {}
        : {
            copiedResources: Object.fromEntries(Object.entries(copiedResources).sort(([a], [b]) => a.localeCompare(b))),
          }),
    };
  }
}

/**
 * @internal
 */
@Factory<ResourceSerializationService>(ResourceSerializationService)
export class ResourceSerializationServiceFactory {
  private static instance: ResourceSerializationService;

  /**
   * @internal
   */
  static async create(): Promise<ResourceSerializationService> {
    const resourceDataRepository = await Container.getInstance().get(ResourceDataRepository);
    const importService = await Container.getInstance().get(ImportService);
    const inputService = await Container.getInstance().get(InputService);

    if (!this.instance) {
      this.instance = new ResourceSerializationService(resourceDataRepository, importService, inputService);
    }

    return this.instance;
  }
}
