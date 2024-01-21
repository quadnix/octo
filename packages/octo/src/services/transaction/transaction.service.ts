import {
  ActionInputs,
  ActionOutputs,
  TransactionOptions,
  UnknownResource,
  UnknownSharedResource,
} from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.model.js';
import { Diff, DiffAction } from '../../functions/diff/diff.model.js';
import { IAction } from '../../models/action.interface.js';
import { IResourceAction } from '../../resources/resource-action.interface.js';

export class TransactionService {
  private readonly inputs: ActionInputs = {};
  private readonly modelActions: IAction<ActionInputs, ActionOutputs>[] = [];
  private readonly resourceActions: IResourceAction[] = [];

  private async applyModels(diffs: DiffMetadata[], resources: ActionOutputs): Promise<DiffMetadata[][]> {
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

        for (const a of diff.actions as IAction<ActionInputs, ActionOutputs>[]) {
          // Resolve input requests.
          const inputs: ActionInputs = {};
          const inputKeys = a.collectInput(diffToProcess);
          inputKeys.map((k) => {
            if ((k as string).startsWith('resource')) {
              const resourceId = (k as string).substring('resource.'.length);
              inputs[k] = resources[resourceId];
            } else {
              inputs[k] = this.inputs[k];
            }

            if (!inputs[k]) {
              throw new Error('No matching input found to process action!');
            }
          });

          // Apply all actions on the diff, then update diff metadata with inputs and outputs.
          const promiseToApplyAction = a.handle(diffToProcess, inputs).then((outputs) => {
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
          if (resource.MODEL_TYPE === 'shared-resource' && resources[resourceId]) {
            resources[resourceId] = (resource as UnknownSharedResource).merge(
              resources[resourceId] as UnknownSharedResource,
            );
          } else {
            resources[resourceId] = resource;
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

  private async applyResources(diffs: DiffMetadata[]): Promise<DiffMetadata[][]> {
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
          promiseToApplyActions.push(a.handle(diffToProcess));
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

  private async diffResources(newResources: ActionOutputs, oldResources: ActionOutputs): Promise<Diff[]> {
    const diffs: Diff[] = [];

    for (const oldResourceId in oldResources) {
      const rDiff = await newResources[oldResourceId].diff(oldResources[oldResourceId]);
      diffs.push(...rDiff);
    }

    for (const newResourceId in newResources) {
      if (!oldResources[newResourceId]) {
        const newResource = newResources[newResourceId];

        if (newResource.MODEL_TYPE === 'shared-resource' || newResource.getSharedResource() !== undefined) {
          const rDiff = await newResource.diff();
          diffs.push(...rDiff);
        } else {
          diffs.push(new Diff(newResource, DiffAction.ADD, 'resourceId', newResource.resourceId));
        }
      }
    }

    return diffs;
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
    return diffs.filter((d) => d.model.getContext() === diff.model.getContext());
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
    const dependencies = diff.model['dependencies'];
    const dependencyApplyOrders: number[] = [-1];

    for (const dependency of dependencies) {
      // Iterate diffs looking to match dependency on same field and action.
      const matchingDiffs = diffs.filter(
        (d) =>
          d.model.getContext() === dependency.to.getContext() &&
          dependency.hasMatchingBehavior(diff.field, diff.action, d.field, d.action),
      );

      // On each diff that should be processed first, apply order on it before than self.
      for (const matchingDiff of matchingDiffs) {
        this.setApplyOrder(matchingDiff, diffs, [...seen, diff]);
        dependencyApplyOrders.push(matchingDiff.applyOrder);
      }
    }

    diff.applyOrder = Math.max(...dependencyApplyOrders) + 1;
  }

  async *beginTransaction(
    diffs: Diff[],
    oldResources: ActionOutputs = {},
    newResources: ActionOutputs = {},
    options: TransactionOptions = {
      yieldModelTransaction: false,
      yieldNewResources: false,
      yieldResourceDiffs: false,
      yieldResourceTransaction: false,
    },
  ): AsyncGenerator<DiffMetadata[][] | UnknownResource[], DiffMetadata[][]> {
    // Set apply order on model diffs.
    const modelDiffs = diffs.map(
      (d) =>
        new DiffMetadata(
          d,
          this.modelActions.filter((a) => a.filter(d)),
        ),
    );
    for (const diff of modelDiffs) {
      this.setApplyOrder(diff, modelDiffs);
    }

    // Apply model diffs.
    const modelTransaction = await this.applyModels(modelDiffs, newResources);
    if (options.yieldModelTransaction) {
      yield modelTransaction;
    }

    // Yield new resources.
    if (options.yieldNewResources) {
      yield Object.values(newResources);
    }

    // Generate diff on resources.
    diffs = await this.diffResources(newResources, oldResources);
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

  registerModelActions(actions: IAction<ActionInputs, ActionOutputs>[]): void {
    for (const action of actions) {
      if (!this.modelActions.find((a) => a.ACTION_NAME === action.ACTION_NAME)) {
        this.modelActions.push(action);
      }
    }
  }

  registerResourceActions(actions: IResourceAction[]): void {
    for (const action of actions) {
      if (!this.resourceActions.find((a) => a.ACTION_NAME === action.ACTION_NAME)) {
        this.resourceActions.push(action);
      }
    }
  }

  registerInputs(inputs: ActionInputs): void {
    for (const key in inputs) {
      this.inputs[key] = inputs[key];
    }
  }

  async *rollbackTransaction(
    modelTransaction: DiffMetadata[][],
    oldResources: ActionOutputs = {},
    newResources: ActionOutputs = {},
    options: TransactionOptions = {
      yieldResourceDiffs: false,
      yieldResourceTransaction: false,
    },
  ): AsyncGenerator<DiffMetadata[][], DiffMetadata[][]> {
    // Set revert on model diffs.
    for (let i = modelTransaction.length - 1; i >= 0; i--) {
      const diffsProcessedInSameLevel = modelTransaction[i];

      for (const diff of diffsProcessedInSameLevel) {
        for (const a of diff.actions as IAction<ActionInputs, ActionOutputs>[]) {
          const outputs = a.revert(diff.diff, diff.inputs, diff.outputs);
          for (const outputKey in outputs) {
            newResources[outputKey] = outputs[outputKey];
          }
        }
      }
    }

    // Generate diff on resources.
    const diffs = await this.diffResources(oldResources, newResources);
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

  static async create(): Promise<TransactionService> {
    if (!this.instance) {
      this.instance = new TransactionService();
    }
    return this.instance;
  }
}
