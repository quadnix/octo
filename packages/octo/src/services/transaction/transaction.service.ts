import {
  type ActionInputs,
  type Constructable,
  NodeType,
  type TransactionOptions,
  type UnknownModel,
  type UnknownOverlay,
  type UnknownResource,
  type UnknownSharedResource,
} from '../../app.type.js';
import { InputNotFoundTransactionError, TransactionError } from '../../errors/index.js';
import {
  ModelActionRegistrationEvent,
  ModelActionTransactionEvent,
  ModelDiffsTransactionEvent,
  ModelTransactionTransactionEvent,
  ResourceActionRegistrationEvent,
  ResourceActionTransactionEvent,
  ResourceDiffsTransactionEvent,
  ResourceTransactionTransactionEvent,
} from '../../events/index.js';
import { Container } from '../../functions/container/container.js';
import { EventSource } from '../../decorators/event-source.decorator.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { type Diff, DiffAction } from '../../functions/diff/diff.js';
import type { ANode } from '../../functions/node/node.abstract.js';
import type { IModelAction } from '../../models/model-action.interface.js';
import type { AModel } from '../../models/model.abstract.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import type { AOverlay } from '../../overlays/overlay.abstract.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { AResource } from '../../resources/resource.abstract.js';
import { IResource } from '../../resources/resource.interface.js';
import { CaptureService } from '../capture/capture.service.js';
import { EventService } from '../event/event.service.js';
import { InputService } from '../input/input.service.js';

export class TransactionService {
  private readonly modelActions: { modelClass: Constructable<UnknownModel>; actions: IModelAction[] }[] = [];
  private readonly overlayActions: { overlayClass: Constructable<UnknownOverlay>; actions: IModelAction[] }[] = [];
  private readonly resourceActions: { resourceClass: Constructable<UnknownResource>; actions: IResourceAction[] }[] =
    [];

  constructor(
    private readonly captureService: CaptureService,
    private readonly inputService: InputService,
    private readonly overlayDataRepository: OverlayDataRepository,
    private readonly resourceDataRepository: ResourceDataRepository,
  ) {}

  private async applyModels(diffs: DiffMetadata[]): Promise<DiffMetadata[][]> {
    const transaction: DiffMetadata[][] = [];

    let currentApplyOrder = 0;
    let processed = 0;

    while (processed < diffs.length) {
      const diffsInSameLevel = diffs.filter((d) => d.applyOrder === currentApplyOrder);
      const diffsProcessedInSameLevel: DiffMetadata[] = [];

      for (const diff of diffsInSameLevel) {
        if (diff.applied) {
          continue;
        }

        // Check for duplicate diffs on the same model and same field.
        const duplicateDiffs = this.getDuplicateDiffs(diff, diffsInSameLevel);

        // Only process the first diff, given all duplicate diffs are the same.
        const diffToProcess = duplicateDiffs[0].diff;

        for (const a of diff.actions as IModelAction[]) {
          // Resolve input requests.
          const inputs: ActionInputs = {};
          const inputKeys = a.collectInput(diffToProcess);
          inputKeys.forEach((k) => {
            inputs[k] = this.inputService.getInput(k);
            if (!inputs[k]) {
              throw new InputNotFoundTransactionError(
                'No matching input found to process action!',
                a,
                diffToProcess,
                k,
              );
            }
          });

          // Apply all actions on the diff, then update diff metadata with inputs and outputs.
          const outputs = await a.handle(diffToProcess, inputs, {});
          // Overwrite previous resources with new resources, except for shared resources,
          // which can be merged if it exists.
          for (const [resourceId, resource] of Object.entries(outputs)) {
            const previousResource = this.resourceDataRepository.getNewResourceById(resourceId);
            if ((resource.constructor as typeof AResource).NODE_TYPE === 'shared-resource' && previousResource) {
              this.resourceDataRepository.addNewResource(
                (resource as UnknownSharedResource).merge(previousResource as UnknownSharedResource),
              );
            } else {
              this.resourceDataRepository.addNewResource(resource);
            }
          }

          duplicateDiffs.forEach((d) => {
            d.updateInputs(inputs);
            d.updateOutputs(outputs);
          });

          EventService.getInstance().emit(new ModelActionTransactionEvent(a.constructor.name));
        }

        // Include the diff to process in the list of diffs processed in the same level.
        diffsProcessedInSameLevel.push(duplicateDiffs[0]);

        // Mark metadata of each duplicate diffs as applied.
        duplicateDiffs.forEach((d) => (d.applied = true));
      }

      // Add all diff in same level to transaction.
      transaction.push(diffsProcessedInSameLevel);

      processed += diffsInSameLevel.length;
      currentApplyOrder += 1;
    }

    return transaction;
  }

  private async applyResources(
    diffs: DiffMetadata[],
    { enableResourceCapture = false }: { enableResourceCapture?: boolean } = {},
  ): Promise<DiffMetadata[][]> {
    const transaction: DiffMetadata[][] = [];

    let currentApplyOrder = 0;
    let processed = 0;

    while (processed < diffs.length) {
      const diffsInSameLevel = diffs.filter((d) => d.applyOrder === currentApplyOrder);
      const diffsProcessedInSameLevel: DiffMetadata[] = [];

      for (const diff of diffsInSameLevel) {
        if (diff.applied) {
          continue;
        }

        // Check for duplicate diffs on the same resource and same field.
        const duplicateDiffs = this.getDuplicateDiffs(diff, diffsInSameLevel);

        // Only process the first diff, given all duplicate diffs are the same.
        const diffToProcess = duplicateDiffs[0].diff;

        for (const a of diff.actions as IResourceAction[]) {
          if (enableResourceCapture) {
            const capture = this.captureService.getCapture((diff.node as unknown as IResource).resourceId);
            await a.mock(capture?.response, diff);
            await a.handle(diffToProcess);
          } else {
            await a.handle(diffToProcess);
          }

          // De-reference from actual resources.
          const deReferenceResource = async (resourceId): Promise<UnknownResource> => {
            return this.resourceDataRepository.getActualResourceById(resourceId)!;
          };

          // Incrementally apply diff inverse to the respective actual resource.
          let actualResource = this.resourceDataRepository.getActualResourceById(
            (diffToProcess.node as UnknownResource).resourceId,
          )!;
          if (!actualResource) {
            actualResource = await AResource.cloneResource(diffToProcess.node as UnknownResource, deReferenceResource);
            this.resourceDataRepository.addActualResource(actualResource);
          } else {
            await actualResource.diffInverse(diffToProcess, deReferenceResource);
          }

          EventService.getInstance().emit(new ResourceActionTransactionEvent(a.constructor.name));
        }

        // Include the diff to process in the list of diffs processed in the same level.
        diffsProcessedInSameLevel.push(duplicateDiffs[0]);

        // Mark metadata of each duplicate diffs as applied.
        duplicateDiffs.forEach((d) => (d.applied = true));
      }

      // Add all diff in same level to transaction.
      transaction.push(diffsProcessedInSameLevel);

      processed += diffsInSameLevel.length;
      currentApplyOrder += 1;
    }

    return transaction;
  }

  private getDuplicateDiffs(diff: DiffMetadata, diffs: DiffMetadata[]): DiffMetadata[] {
    return diffs.filter(
      (d) =>
        d.node.getContext() === diff.node.getContext() &&
        d.field === diff.field &&
        d.action === diff.action &&
        d.value === diff.value,
    );
  }

  private getMatchingDiffs(diff: DiffMetadata, diffs: DiffMetadata[]): DiffMetadata[] {
    return diffs.filter(
      (d) => d.node.getContext() === diff.node.getContext() && d.field === diff.field && d.value === diff.value,
    );
  }

  /**
   * Before assigning order to a diff, all its node's parent diffs must be processed.
   * E.g. diff to add environment, depends on region to exist, thus add region diff gets processed first.
   */
  private setApplyOrder(diff: DiffMetadata, diffs: DiffMetadata[], seen: DiffMetadata[] = []): void {
    // Detect circular dependencies.
    if (this.getDuplicateDiffs(diff, seen).length > 0) {
      throw new TransactionError('Found circular dependencies!');
    }

    // Detect conflicting actions in transaction.
    const matchingDiffs = this.getMatchingDiffs(diff, diffs);
    const diffActions = matchingDiffs.reduce((accumulator, currentValue) => {
      accumulator[currentValue.action] = true;
      return accumulator;
    }, {});
    if (
      (diffActions[DiffAction.ADD] && diffActions[DiffAction.UPDATE]) ||
      (diffActions[DiffAction.ADD] && diffActions[DiffAction.DELETE]) ||
      (diffActions[DiffAction.DELETE] && diffActions[DiffAction.UPDATE])
    ) {
      throw new TransactionError('Found conflicting actions in same transaction!');
    }

    // Skip processing diff that already has the applyOrder set.
    if (diff.applyOrder >= 0) {
      return;
    }

    // Get all dependencies of subject node.
    const dependencies = diff.node.getDependencies();
    const dependencyApplyOrders: number[] = [-1];

    for (const dependency of dependencies) {
      // Iterate diffs looking to match dependency on same field and action.
      const matchingParentDiffs = diffs.filter(
        (d) =>
          d.node.getContext() === dependency.to.getContext() &&
          dependency.hasMatchingBehavior(diff.field, diff.action, d.field, d.action),
      );

      // On each diff that should be processed first, apply order on it before than self.
      for (const matchingParentDiff of matchingParentDiffs) {
        this.setApplyOrder(matchingParentDiff, diffs, [...seen, diff]);
        dependencyApplyOrders.push(matchingParentDiff.applyOrder);
      }
    }

    diff.applyOrder = Math.max(...dependencyApplyOrders) + 1;
  }

  async *beginTransaction(
    diffs: Diff[],
    {
      enableResourceCapture = false,
      yieldModelDiffs = false,
      yieldModelTransaction = false,
      yieldResourceDiffs = false,
      yieldResourceTransaction = false,
    }: TransactionOptions = {},
  ): AsyncGenerator<DiffMetadata[][], DiffMetadata[][]> {
    // Diff overlays and add to existing diffs.
    diffs.push(...(await this.overlayDataRepository.diff()));

    // Generate diff on models.
    const modelDiffs = diffs.map((d) => {
      if ((d.node.constructor as typeof ANode).NODE_TYPE === NodeType.OVERLAY) {
        return new DiffMetadata(
          d,
          (
            this.overlayActions.find(
              (a) => (a.overlayClass as unknown as typeof AOverlay) === (d.node.constructor as typeof AOverlay),
            )?.actions || []
          ).filter((a) => a.filter(d)),
        );
      } else {
        return new DiffMetadata(
          d,
          (
            this.modelActions.find(
              (a) => (a.modelClass as unknown as typeof AModel) === (d.node.constructor as typeof AModel),
            )?.actions || []
          ).filter((a) => a.filter(d)),
        );
      }
    });
    // Set apply order on model diffs.
    for (const diff of modelDiffs) {
      this.setApplyOrder(diff, modelDiffs);
    }

    EventService.getInstance().emit(new ModelDiffsTransactionEvent([modelDiffs]));
    if (yieldModelDiffs) {
      yield [modelDiffs];
    }

    // Apply model diffs.
    const modelTransaction = await this.applyModels(modelDiffs);

    EventService.getInstance().emit(new ModelTransactionTransactionEvent(modelTransaction));
    if (yieldModelTransaction) {
      yield modelTransaction;
    }

    // Generate resource diffs.
    const newDiffs = await this.resourceDataRepository.diff();
    const dirtyDiffs = await this.resourceDataRepository.diffDirty();

    // new diffs = new - old | dirty diffs = new - actual
    // Any new diff that is also not part of dirty diffs should be skipped, as the actual is already in desired state.
    for (let i = newDiffs.length - 1; i >= 0; i--) {
      const newDiff = newDiffs[i];
      if (
        !dirtyDiffs.some(
          (d) =>
            d.node.getContext() === newDiff.node.getContext() &&
            d.action === newDiff.action &&
            d.field === newDiff.field &&
            d.value === newDiff.value,
        )
      ) {
        newDiffs.splice(i, 1);
      }
    }

    // Ensure any new diffs are not operating on dirty resources.
    this.resourceDataRepository.ensureDiffsNotOperatingOnDirtyResources(newDiffs);

    // Skip processing dirty diffs that are already accounted for in new diffs.
    for (let i = dirtyDiffs.length - 1; i >= 0; i--) {
      const dirtyDiff = dirtyDiffs[i];
      if (
        newDiffs.some(
          (d) =>
            d.node.getContext() === dirtyDiff.node.getContext() &&
            d.action === dirtyDiff.action &&
            d.field === dirtyDiff.field &&
            d.value === dirtyDiff.value,
        )
      ) {
        dirtyDiffs.splice(i, 1);
      }
    }

    // Generate diff on resources.
    const resourceDiffs = newDiffs.map(
      (d) =>
        new DiffMetadata(
          d,
          (
            this.resourceActions.find(
              (a) => (a.resourceClass as unknown as typeof AResource) === (d.node.constructor as typeof AResource),
            )?.actions || []
          ).filter((a) => a.filter(d)),
        ),
    );
    // Set apply order on resource diffs.
    for (const diff of resourceDiffs) {
      this.setApplyOrder(diff, resourceDiffs);
    }
    // Generate diff on dirty resources.
    const dirtyResourceDiffs = dirtyDiffs.map(
      (d) =>
        new DiffMetadata(
          d,
          (
            this.resourceActions.find(
              (a) => (a.resourceClass as unknown as typeof AResource) === (d.node.constructor as typeof AResource),
            )?.actions || []
          ).filter((a) => a.filter(d)),
        ),
    );
    // Set apply order on dirty resource diffs.
    for (const diff of dirtyResourceDiffs) {
      this.setApplyOrder(diff, dirtyResourceDiffs);
    }

    EventService.getInstance().emit(new ResourceDiffsTransactionEvent([[resourceDiffs], [dirtyResourceDiffs]]));
    if (yieldResourceDiffs) {
      yield [resourceDiffs, dirtyResourceDiffs];
    }

    // Apply resource diffs.
    const resourceTransaction = await this.applyResources(resourceDiffs, {
      enableResourceCapture,
    });
    // Apply dirty resource diffs.
    const dirtyResourceTransaction = await this.applyResources(dirtyResourceDiffs, {
      enableResourceCapture,
    });

    EventService.getInstance().emit(
      new ResourceTransactionTransactionEvent([resourceTransaction, dirtyResourceTransaction]),
    );
    if (yieldResourceTransaction) {
      yield [...resourceTransaction, ...dirtyResourceTransaction];
    }

    return modelTransaction;
  }

  @EventSource(ModelActionRegistrationEvent)
  registerModelActions(forModel: Constructable<UnknownModel>, actions: IModelAction[]): void {
    const modelActions = this.modelActions.find((a) => a.modelClass === forModel);
    if (!modelActions) {
      this.modelActions.push({ actions: actions, modelClass: forModel });
    } else {
      for (const action of actions) {
        if (modelActions.actions.find((a) => a.constructor.name === action.constructor.name)) {
          throw new Error(`Action "${action.constructor.name}" already registered for model "${forModel.name}"!`);
        }
        modelActions.actions.push(action);
      }
    }
  }

  @EventSource(ModelActionRegistrationEvent)
  registerOverlayActions(forOverlay: Constructable<UnknownOverlay>, actions: IModelAction[]): void {
    const overlayActions = this.overlayActions.find((a) => a.overlayClass === forOverlay);
    if (!overlayActions) {
      this.overlayActions.push({ actions: actions, overlayClass: forOverlay });
    } else {
      for (const action of actions) {
        if (overlayActions.actions.find((a) => a.constructor.name === action.constructor.name)) {
          throw new Error(`Action "${action.constructor.name}" already registered for overlay "${forOverlay.name}"!`);
        }
        overlayActions.actions.push(action);
      }
    }
  }

  @EventSource(ResourceActionRegistrationEvent)
  registerResourceActions(forResource: Constructable<UnknownResource>, actions: IResourceAction[]): void {
    const resourceActions = this.resourceActions.find((a) => a.resourceClass === forResource);
    if (!resourceActions) {
      this.resourceActions.push({ actions: actions, resourceClass: forResource });
    } else {
      for (const action of actions) {
        if (resourceActions.actions.find((a) => a.constructor.name === action.constructor.name)) {
          throw new Error(`Action "${action.constructor.name}" already registered for resource "${forResource.name}"!`);
        }
        resourceActions.actions.push(action);
      }
    }
  }
}

@Factory<TransactionService>(TransactionService)
export class TransactionServiceFactory {
  private static instance: TransactionService;

  static async create(forceNew = false): Promise<TransactionService> {
    const container = Container.getInstance();

    const [captureService, inputService, overlayDataRepository, resourceDataRepository] = await Promise.all([
      container.get(CaptureService),
      container.get(InputService),
      container.get(OverlayDataRepository),
      container.get(ResourceDataRepository),
    ]);
    if (!this.instance) {
      this.instance = new TransactionService(
        captureService,
        inputService,
        overlayDataRepository,
        resourceDataRepository,
      );
    }
    if (forceNew) {
      const newInstance = new TransactionService(
        captureService,
        inputService,
        overlayDataRepository,
        resourceDataRepository,
      );
      Object.keys(this.instance).forEach((key) => (this.instance[key] = newInstance[key]));
    }
    return this.instance;
  }
}
