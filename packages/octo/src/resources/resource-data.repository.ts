import { type ActionOutputs, MatchingResource, NodeType, type UnknownResource } from '../app.type.js';
import { Factory } from '../decorators/factory.decorator.js';
import { DiffsOnDirtyResourcesTransactionError, ResourceError } from '../errors/index.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import type { AResource } from './resource.abstract.js';

/**
 * @internal
 */
export class ResourceDataRepository {
  private dirtyResources: UnknownResource[] = [];

  /**
   * @internal
   */
  constructor(
    private actualResources: UnknownResource[],
    private oldResources: UnknownResource[],
    private newResources: UnknownResource[],
  ) {
    for (const resource of oldResources) {
      const actual = actualResources.find((r) => r.getContext() === resource.getContext());
      if (!resource.isDeepEquals(actual)) {
        this.dirtyResources.push(resource);
      }
    }
    for (const resource of actualResources) {
      if (!oldResources.find((r) => r.getContext() === resource.getContext())) {
        this.dirtyResources.push(resource);
      }
    }
  }

  /**
   * @internal
   */
  addActualResource(resource: UnknownResource): void {
    if ((resource.constructor as typeof AResource).NODE_TYPE !== NodeType.RESOURCE) {
      throw new ResourceError('Adding non-resource node!', resource);
    }

    // Insert resource.
    const rIndex = this.actualResources.findIndex((r) => r.getContext() === resource.getContext());
    if (rIndex === -1) {
      this.actualResources.push(resource);
    } else {
      throw new ResourceError('Resource in actual already exists!', resource);
    }
  }

  /**
   * @internal
   */
  addNewResource(resource: UnknownResource): void {
    if ((resource.constructor as typeof AResource).NODE_TYPE !== NodeType.RESOURCE) {
      throw new ResourceError('Adding non-resource node!', resource);
    }

    // Insert resource.
    const rIndex = this.newResources.findIndex((r) => r.getContext() === resource.getContext());
    if (rIndex === -1) {
      this.newResources.push(resource);
    } else {
      throw new ResourceError('Resource in new already exists!', resource);
    }

    // Clone response from old.
    const oIndex = this.oldResources.findIndex((r) => r.getContext() === resource.getContext());
    if (oIndex > -1) {
      resource.cloneResponseInPlace(this.oldResources[oIndex]);
    }
  }

  /**
   * @internal
   */
  async diff(): Promise<Diff[]> {
    const oldResources: ActionOutputs = this.oldResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.getContext()]: current }),
      {},
    );
    const newResources: ActionOutputs = this.newResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.getContext()]: current }),
      {},
    );

    const diffs: Diff[] = [];

    for (const oldResource of Object.values(oldResources)) {
      if (oldResource.isMarkedDeleted()) {
        delete oldResources[oldResource.getContext()];
      }
    }
    for (const newResource of Object.values(newResources)) {
      if (newResource.isMarkedDeleted()) {
        delete newResources[newResource.getContext()];
      }
    }

    for (const oldResourceContext of Object.keys(oldResources)) {
      if (!newResources[oldResourceContext] || newResources[oldResourceContext].isMarkedDeleted()) {
        const rDiff = new Diff(oldResources[oldResourceContext], DiffAction.DELETE, 'resourceId', oldResourceContext);
        diffs.push(...oldResources[oldResourceContext].diffUnpack(rDiff));
      } else {
        const rDiff = await newResources[oldResourceContext].diff(oldResources[oldResourceContext]);
        diffs.push(...rDiff.map((d) => newResources[oldResourceContext].diffUnpack(d)).flat());
      }
    }

    for (const newResourceContext of Object.keys(newResources)) {
      if (oldResources[newResourceContext]) {
        continue;
      }

      const newResource = newResources[newResourceContext];
      const rDiff = new Diff(newResource, DiffAction.ADD, 'resourceId', newResourceContext);
      diffs.push(...newResource.diffUnpack(rDiff));
    }

    return diffs;
  }

  /**
   * @internal
   */
  async diffDirty(): Promise<Diff[]> {
    const actualResources: ActionOutputs = this.actualResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.getContext()]: current }),
      {},
    );
    const newResources: ActionOutputs = this.newResources.reduce(
      (accumulator, current) => ({ ...accumulator, [current.getContext()]: current }),
      {},
    );

    const diffs: Diff[] = [];

    for (const actualResource of Object.values(actualResources)) {
      if (actualResource.isMarkedDeleted()) {
        delete actualResources[actualResource.getContext()];
      }
    }
    for (const newResource of Object.values(newResources)) {
      if (newResource.isMarkedDeleted()) {
        delete newResources[newResource.getContext()];
      }
    }

    for (const actualResourceContext of Object.keys(actualResources)) {
      if (!newResources[actualResourceContext] || newResources[actualResourceContext].isMarkedDeleted()) {
        const rDiff = new Diff(
          actualResources[actualResourceContext],
          DiffAction.DELETE,
          'resourceId',
          actualResourceContext,
        );
        diffs.push(...actualResources[actualResourceContext].diffUnpack(rDiff));
      } else {
        const rDiff = await newResources[actualResourceContext].diff(actualResources[actualResourceContext]);
        diffs.push(...rDiff.map((d) => newResources[actualResourceContext].diffUnpack(d)).flat());
      }
    }

    for (const newResourceContext of Object.keys(newResources)) {
      if (actualResources[newResourceContext]) {
        continue;
      }

      const newResource = newResources[newResourceContext];
      const rDiff = new Diff(newResource, DiffAction.ADD, 'resourceId', newResourceContext);
      diffs.push(...newResource.diffUnpack(rDiff));
    }

    return diffs;
  }

  /**
   * @internal
   */
  diffValidate(): Diff[] {
    const diffs: Diff[] = [];

    for (const resource of this.actualResources) {
      diffs.push(new Diff(resource, DiffAction.VALIDATE, 'resourceId', ''));
    }

    return diffs;
  }

  /**
   * @internal
   */
  ensureDiffsNotOperatingOnDirtyResources(diffs: Diff[]): void {
    if (diffs.some((d) => this.dirtyResources.some((dr) => d.node.hasAncestor(dr)))) {
      throw new DiffsOnDirtyResourcesTransactionError(
        'Cannot operate diff on dirty resources!',
        diffs,
        this.dirtyResources,
      );
    }
  }

  /**
   * @internal
   */
  getActualResourceByContext(context: string): UnknownResource | undefined {
    return this.actualResources.find((r) => r.getContext() === context);
  }

  /**
   * @internal
   */
  getActualResourcesByProperties(filters: { key: string; value: any }[] = []): UnknownResource[] {
    return this.actualResources.filter((r) => filters.every((c) => r.properties[c.key] === c.value));
  }

  /**
   * @internal
   */
  getNewResourceByContext(context: string): UnknownResource | undefined {
    return this.newResources.find((r) => r.getContext() === context);
  }

  /**
   * @internal
   */
  getNewResourcesByProperties(filters: { key: string; value: any }[] = []): UnknownResource[] {
    return this.newResources.filter((r) => filters.every((c) => r.properties[c.key] === c.value));
  }

  /**
   * @internal
   */
  removeNewResource(resource: UnknownResource): void {
    if ((resource.constructor as typeof AResource).NODE_TYPE !== NodeType.RESOURCE) {
      throw new ResourceError('Removing non-resource node!', resource);
    }

    if (!resource.isMarkedDeleted()) {
      resource.remove();
    }

    const rIndex = this.newResources.findIndex((r) => r.getContext() === resource.getContext());
    if (rIndex > -1) {
      this.newResources.splice(rIndex, 1);
    }
  }

  /**
   * Marks the new (desired) resource graph as applied: the actual graph becomes the new graph and
   * nothing is dirty. Used by terraform commit, where terraform has already applied the desired
   * state.
   *
   * `unconfirmedResourceContexts` names resources a partial commit could not confirm. Each keeps its
   * last committed state, or is left out of the actual graph when it had none, so the next run plans
   * it again - which terraform reconciles against its own state. A confirmed resource standing on one
   * left out is held back the same way, and the actual graph keeps every parent its resources name.
   *
   * `retainResourceContexts` names resources whose deletion did not run. Each is carried over from
   * the graph being replaced, along with the parents it needs to deserialize with, and joins both
   * graphs: the actual graph records it as still present, and the new graph is what the next run
   * diffs against, which is what plans its deletion again.
   *
   * @returns The contexts of the confirmed resources held back with an unconfirmed parent.
   */
  syncActualToNew(
    unconfirmedResourceContexts: Set<string> = new Set(),
    retainResourceContexts: Set<string> = new Set(),
  ): string[] {
    for (const resource of this.collectWithParents(retainResourceContexts)) {
      const rIndex = this.newResources.findIndex((r) => r.getContext() === resource.getContext());
      if (rIndex === -1) {
        this.newResources.push(resource);
      } else if (this.newResources[rIndex].isMarkedDeleted()) {
        this.newResources[rIndex] = resource;
      }
    }

    // Take each confirmed resource as it is now, and each unconfirmed one as it was last committed.
    const committed = new Map(this.actualResources.map((r) => [r.getContext(), r]));
    const actual = new Map<string, UnknownResource>();
    for (const resource of this.newResources) {
      const context = resource.getContext();
      if (!unconfirmedResourceContexts.has(context)) {
        actual.set(context, resource);
      } else if (committed.has(context)) {
        actual.set(context, committed.get(context)!);
      }
    }

    // Keep every parent named: a committed one as it was, else hold its child back the same way.
    const heldBackResourceContexts: string[] = [];
    let isClosed = false;
    while (!isClosed) {
      isClosed = true;
      for (const [context, resource] of actual) {
        const missingParentContext = resource.parents
          .map((p) => (p instanceof MatchingResource ? p.getActual() : p).getContext())
          .find((parentContext) => !actual.has(parentContext));
        if (missingParentContext === undefined) {
          continue;
        }

        isClosed = false;
        if (committed.has(missingParentContext)) {
          for (const parent of this.collectWithParents(new Set([missingParentContext]))) {
            if (!actual.has(parent.getContext())) {
              actual.set(parent.getContext(), parent);
            }
          }
        } else {
          heldBackResourceContexts.push(context);
          if (committed.has(context)) {
            actual.set(context, committed.get(context)!);
          } else {
            actual.delete(context);
          }
        }
        break;
      }
    }

    this.actualResources = [...actual.values()];
    this.dirtyResources = [];
    return [...new Set(heldBackResourceContexts)].filter((c) => !unconfirmedResourceContexts.has(c));
  }

  /**
   * Collects the named resources out of the actual graph, closed over their parents.
   *
   * A resource deserializes by de-referencing every parent it names, so a resource is only worth
   * keeping when the graph keeps the parents above it too.
   */
  private collectWithParents(resourceContexts: Set<string>): UnknownResource[] {
    const collected = new Map<string, UnknownResource>();
    const contextsToProcess = [...resourceContexts];

    while (contextsToProcess.length > 0) {
      const context = contextsToProcess.shift()!;
      if (collected.has(context)) {
        continue;
      }

      const resource = this.actualResources.find((r) => r.getContext() === context);
      if (!resource) {
        continue;
      }

      collected.set(context, resource);
      contextsToProcess.push(
        ...resource.parents.map((p) => (p instanceof MatchingResource ? p.getActual() : p).getContext()),
      );
    }

    return [...collected.values()];
  }
}

/**
 * @internal
 */
@Factory<ResourceDataRepository>(ResourceDataRepository)
export class ResourceDataRepositoryFactory {
  private static instance: ResourceDataRepository;

  /**
   * @internal
   */
  static async create(
    forceNew: boolean = false,
    actualResources: UnknownResource[] = [],
    oldResources: UnknownResource[] = [],
    newResources: UnknownResource[] = [],
  ): Promise<ResourceDataRepository> {
    if (!this.instance) {
      this.instance = new ResourceDataRepository(actualResources, oldResources, newResources);
    }

    if (forceNew) {
      const newResourceDataRepository = new ResourceDataRepository(actualResources, oldResources, newResources);

      this.instance['actualResources'] = actualResources;
      this.instance['dirtyResources'] = newResourceDataRepository['dirtyResources'];
      this.instance['newResources'] = newResources;
      this.instance['oldResources'] = oldResources;
    }

    return this.instance;
  }
}
