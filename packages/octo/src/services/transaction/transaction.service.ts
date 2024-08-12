import {
  type ActionInputs,
  NodeType,
  type TransactionOptions,
  type UnknownResource,
  type UnknownSharedResource,
} from '../../app.type.js';
import { Container } from '../../functions/container/container.js';
import { EventSource } from '../../decorators/event-source.decorator.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { ModelActionRegistrationEvent, ResourceActionRegistrationEvent } from '../../events/registration.event.js';
import { ModelActionTransactionEvent, ResourceActionTransactionEvent } from '../../events/transaction.event.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { type Diff, DiffAction } from '../../functions/diff/diff.js';
import type { IModelAction } from '../../models/model-action.interface.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { IResource } from '../../resources/resource.interface.js';
import { CaptureService } from '../capture/capture.service.js';
import { EventService } from '../event/event.service.js';
import { InputService } from '../input/input.service.js';

export class TransactionService {
  private readonly modelActions: IModelAction[] = [];
  private readonly overlayActions: IModelAction[] = [];
  private readonly resourceActions: IResourceAction[] = [];

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
              throw new Error('No matching input found to process action!');
            }
          });

          // Apply all actions on the diff, then update diff metadata with inputs and outputs.
          const outputs = await a.handle(diffToProcess, inputs, {});
          // Overwrite previous resources with new resources, except for shared resources,
          // which can be merged if it exists.
          for (const [resourceId, resource] of Object.entries(outputs)) {
            const previousResource = this.resourceDataRepository.getNewResourceById(resourceId);
            if (resource.NODE_TYPE === 'shared-resource' && previousResource) {
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

          EventService.getInstance().emit(new ModelActionTransactionEvent(a.ACTION_NAME));
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

          // Incrementally apply diff inverse to the respective actual resource.
          let actualResource = this.resourceDataRepository.getActualResourceById(
            (diffToProcess.node as UnknownResource).resourceId,
          )!;
          if (!actualResource) {
            const ResourceConstructor = (diffToProcess.node as UnknownResource).constructor;
            // @ts-expect-error create an empty resource.
            actualResource = new ResourceConstructor((diffToProcess.node as UnknownResource).resourceId, {}, []);
            this.resourceDataRepository.addActualResource(actualResource);
          }
          await actualResource.diffInverse(diffToProcess, async (resourceId) => {
            return this.resourceDataRepository.getActualResourceById(resourceId)!;
          });

          EventService.getInstance().emit(new ResourceActionTransactionEvent(a.ACTION_NAME));
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
      throw new Error('Found circular dependencies!');
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
      throw new Error('Found conflicting actions in same transaction!');
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
      yieldDirtyResourceDiffs = false,
      yieldDirtyResourceTransaction = false,
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
      if (d.node.NODE_TYPE === NodeType.OVERLAY) {
        return new DiffMetadata(
          d,
          this.overlayActions.filter((a) => a.filter(d)),
        );
      } else {
        return new DiffMetadata(
          d,
          this.modelActions.filter((a) => a.filter(d)),
        );
      }
    });
    // Set apply order on model diffs.
    for (const diff of modelDiffs) {
      this.setApplyOrder(diff, modelDiffs);
    }

    if (yieldModelDiffs) {
      yield [modelDiffs];
    }

    // Apply model diffs.
    const modelTransaction = await this.applyModels(modelDiffs);
    if (yieldModelTransaction) {
      yield modelTransaction;
    }

    // Generate diff on resources.
    diffs = await this.resourceDataRepository.diff();
    const resourceDiffs = diffs.map(
      (d) =>
        new DiffMetadata(
          d,
          this.resourceActions.filter((a) => a.filter(d)),
        ),
    );
    // Set apply order on resource diffs.
    for (const diff of resourceDiffs) {
      this.setApplyOrder(diff, resourceDiffs);
    }

    if (yieldResourceDiffs) {
      yield [resourceDiffs];
    }

    // Apply resource diffs.
    const resourceTransaction = await this.applyResources(resourceDiffs, {
      enableResourceCapture,
    });
    if (yieldResourceTransaction) {
      yield resourceTransaction;
    }

    // Generate diff on dirty resources.
    diffs = await this.resourceDataRepository.diffDirty();
    const dirtyResourceDiffs = diffs.map(
      (d) =>
        new DiffMetadata(
          d,
          this.resourceActions.filter((a) => a.filter(d)),
        ),
    );
    // Set apply order on dirty resource diffs.
    for (const diff of dirtyResourceDiffs) {
      this.setApplyOrder(diff, dirtyResourceDiffs);
    }

    if (yieldDirtyResourceDiffs) {
      yield [dirtyResourceDiffs];
    }

    // Apply dirty resource diffs.
    const dirtyResourceTransaction = await this.applyResources(dirtyResourceDiffs, {
      enableResourceCapture,
    });
    if (yieldDirtyResourceTransaction) {
      yield dirtyResourceTransaction;
    }

    return modelTransaction;
  }

  @EventSource(ModelActionRegistrationEvent)
  registerModelActions(actions: IModelAction[]): void {
    for (const action of actions) {
      if (!this.modelActions.find((a) => a.ACTION_NAME === action.ACTION_NAME)) {
        this.modelActions.push(action);
      }
    }
  }

  @EventSource(ModelActionRegistrationEvent)
  registerOverlayActions(actions: IModelAction[]): void {
    for (const action of actions) {
      if (!this.overlayActions.find((a) => a.ACTION_NAME === action.ACTION_NAME)) {
        this.overlayActions.push(action);
      }
    }
  }

  @EventSource(ResourceActionRegistrationEvent)
  registerResourceActions(actions: IResourceAction[]): void {
    for (const action of actions) {
      if (!this.resourceActions.find((a) => a.ACTION_NAME === action.ACTION_NAME)) {
        this.resourceActions.push(action);
      }
    }
  }
}

@Factory<TransactionService>(TransactionService)
export class TransactionServiceFactory {
  private static instance: TransactionService;

  static async create(forceNew = false): Promise<TransactionService> {
    const [captureService, inputService, overlayDataRepository, resourceDataRepository] = await Promise.all([
      Container.get(CaptureService),
      Container.get(InputService),
      Container.get(OverlayDataRepository),
      Container.get(ResourceDataRepository),
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
