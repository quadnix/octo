import {
  type ActionInputs,
  type ActionOutputs,
  ModelType,
  type TransactionOptions,
  type UnknownSharedResource,
} from '../../app.type.js';
import { Container } from '../../decorators/container.js';
import { EventSource } from '../../decorators/event-source.decorator.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { ModelActionRegistrationEvent, ResourceActionRegistrationEvent } from '../../events/registration.event.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { type Diff, DiffAction } from '../../functions/diff/diff.js';
import type { IModelAction } from '../../models/model-action.interface.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { IResource } from '../../resources/resource.interface.js';
import { CaptureService } from '../capture/capture.service.js';
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
      const promiseToApplyActions: Promise<ActionOutputs>[] = [];

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
          const promiseToApplyAction = a.handle(diffToProcess, inputs, {}).then((outputs) => {
            duplicateDiffs.forEach((d) => {
              d.updateInputs(inputs);
              d.updateOutputs(outputs);
            });

            return outputs;
          });
          promiseToApplyActions.push(promiseToApplyAction);
        }

        // Include the diff to process in the list of diffs processed in the same level.
        diffsProcessedInSameLevel.push(duplicateDiffs[0]);

        // Mark metadata of each duplicate diffs as applied.
        duplicateDiffs.forEach((d) => (d.applied = true));
      }

      // Apply all actions of same level, since they can be applied in parallel.
      const actionsOutputs = await Promise.all(promiseToApplyActions);

      // Overwrite previous resources with new resources, except for shared resources,
      // which can be merged if it exists.
      for (const outputs of actionsOutputs) {
        for (const [resourceId, resource] of Object.entries(outputs)) {
          const previousResource = this.resourceDataRepository.getById(resourceId);
          if (resource.MODEL_TYPE === 'shared-resource' && previousResource) {
            this.resourceDataRepository.add(
              (resource as UnknownSharedResource).merge(previousResource as UnknownSharedResource),
            );
          } else {
            this.resourceDataRepository.add(resource);
          }
        }
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
      const promiseToApplyActions: Promise<void>[] = [];

      for (const diff of diffsInSameLevel) {
        if (diff.applied) {
          continue;
        }

        // Check for duplicate diffs on the same model and same field.
        const duplicateDiffs = this.getDuplicateDiffs(diff, diffsInSameLevel);

        // Only process the first diff, given all duplicate diffs are the same.
        const diffToProcess = duplicateDiffs[0].diff;

        for (const a of diff.actions as IResourceAction[]) {
          if (enableResourceCapture) {
            const capture = this.captureService.getCapture((diff.model as IResource).resourceId);
            await a.mock(capture?.response, diff);
            await a.handle(diffToProcess);
          } else {
            promiseToApplyActions.push(a.handle(diffToProcess));
          }
        }

        // Include the diff to process in the list of diffs processed in the same level.
        diffsProcessedInSameLevel.push(duplicateDiffs[0]);

        // Mark metadata of each duplicate diffs as applied.
        duplicateDiffs.forEach((d) => (d.applied = true));
      }

      // Apply all actions of same level, since they can be applied in parallel.
      await Promise.all(promiseToApplyActions);

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
        d.model.getContext() === diff.model.getContext() &&
        d.field === diff.field &&
        d.action === diff.action &&
        d.value === diff.value,
    );
  }

  private getMatchingDiffs(diff: DiffMetadata, diffs: DiffMetadata[]): DiffMetadata[] {
    return diffs.filter(
      (d) => d.model.getContext() === diff.model.getContext() && d.field === diff.field && d.value === diff.value,
    );
  }

  /**
   * Before assigning order to a diff, all its model's parent diffs must be processed.
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

    // Get all dependencies of subject model.
    const dependencies = diff.model.getDependencies();
    const dependencyApplyOrders: number[] = [-1];

    for (const dependency of dependencies) {
      // Iterate diffs looking to match dependency on same field and action.
      const matchingParentDiffs = diffs.filter(
        (d) =>
          d.model.getContext() === dependency.to.getContext() &&
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
    options: TransactionOptions = {
      enableResourceCapture: false,
      yieldModelDiffs: false,
      yieldModelTransaction: false,
      yieldResourceDiffs: false,
      yieldResourceTransaction: false,
    },
  ): AsyncGenerator<DiffMetadata[][], DiffMetadata[][]> {
    // Diff overlays and add to existing diffs.
    diffs.push(...(await this.overlayDataRepository.diff()));

    // Generate diff on models.
    const modelDiffs = diffs.map((d) => {
      if (d.model.MODEL_TYPE === ModelType.OVERLAY) {
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

    if (options.yieldModelDiffs) {
      yield [modelDiffs];
    }

    // Apply model diffs.
    const modelTransaction = await this.applyModels(modelDiffs);
    if (options.yieldModelTransaction) {
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

    if (options.yieldResourceDiffs) {
      yield [resourceDiffs];
    }

    // Apply resource diffs.
    const resourceTransaction = await this.applyResources(resourceDiffs, {
      enableResourceCapture: options.enableResourceCapture,
    });
    if (options.yieldResourceTransaction) {
      yield resourceTransaction;
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

  async *rollbackTransaction(
    modelTransaction: DiffMetadata[][],
    options: TransactionOptions = {
      yieldResourceDiffs: false,
      yieldResourceTransaction: false,
    },
  ): AsyncGenerator<DiffMetadata[][], DiffMetadata[][]> {
    // Set revert on model diffs.
    for (let i = modelTransaction.length - 1; i >= 0; i--) {
      const diffsProcessedInSameLevel = modelTransaction[i];

      for (const diff of diffsProcessedInSameLevel) {
        for (const a of diff.actions as IModelAction[]) {
          const outputs = a.revert(diff.diff, diff.inputs, diff.outputs);
          for (const outputKey in outputs) {
            this.resourceDataRepository.add(outputs[outputKey]);
          }
        }
      }
    }

    // Generate diff on resources.
    const diffs = await this.resourceDataRepository.diff();
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

    if (options.yieldResourceDiffs) {
      yield [resourceDiffs];
    }

    // Apply resource diffs.
    const resourceTransaction = await this.applyResources(resourceDiffs);
    if (options.yieldResourceTransaction) {
      yield resourceTransaction;
    }

    return resourceTransaction;
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
