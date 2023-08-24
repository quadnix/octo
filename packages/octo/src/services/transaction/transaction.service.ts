import { DiffMetadata } from '../../functions/diff/diff-metadata.model';
import { Diff, DiffAction } from '../../functions/diff/diff.model';
import { IAction, IActionInputs, IActionOutputs } from '../../models/action.interface';
import { IResourceAction } from '../../resources/resource-action.interface';

export type TransactionOptions = {
  yieldModelTransaction: boolean;
  yieldResourceDiffs: boolean;
  yieldResourceTransaction: boolean;
};

export class TransactionService {
  private readonly inputs: IActionInputs = {};
  private readonly modelActions: IAction<IActionInputs, IActionOutputs>[] = [];
  private readonly resourceActions: IResourceAction[] = [];

  private applyModels(diffs: DiffMetadata[], resources: IActionOutputs): DiffMetadata[][] {
    const transaction: DiffMetadata[][] = [];

    let currentApplyOrder = 0;
    let processed = 0;

    while (processed < diffs.length) {
      const diffsInSameLevel = diffs.filter((d) => d.applyOrder === currentApplyOrder);
      const diffsProcessedInSameLevel: DiffMetadata[] = [];

      for (const diff of diffsInSameLevel) {
        // Check for similar diffs on the same model and same field.
        const matchingDiffs = this.getMatchingDiffs(diff, diffsInSameLevel);

        // Only process the first diff, given all matching-diffs are the same.
        const diffToProcess = matchingDiffs[0].diff;

        for (const a of diff.actions as IAction<IActionInputs, IActionOutputs>[]) {
          // Resolve input requests.
          const inputs: IActionInputs = {};
          const inputKeys = a.collectInput(diffToProcess);
          inputKeys.map((k) => {
            if ((k as string).startsWith('resource')) {
              inputs[k] = resources[k];
            } else {
              inputs[k] = this.inputs[k];
            }

            if (!inputs[k]) {
              throw new Error('No matching input found to process action!');
            }
          });

          // Apply all actions on the diff.
          const outputs = a.handle(diffToProcess, inputs);

          // Collect new resources.
          const outputsKeyModified = {};
          for (const output of a.collectOutput(diffToProcess)) {
            outputsKeyModified[`resource.${output}`] = outputs[output];
          }
          resources = { ...resources, ...outputsKeyModified };

          // Update diff metadata with inputs and outputs.
          matchingDiffs.forEach((d) => {
            d.updateInputs(inputs);
            d.updateOutputs(outputsKeyModified);
          });
        }

        // Include the diff to process in the list of diffs processed in the same level.
        diffsProcessedInSameLevel.push(matchingDiffs[0]);
      }

      // Mark metadata of each matching-diffs as applied.
      diffsInSameLevel.forEach((d) => (d.applied = true));

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
        // Check for similar diffs on the same model and same field.
        const matchingDiffs = this.getMatchingDiffs(diff, diffsInSameLevel);

        // Only process the first diff, given all matching-diffs are the same.
        const diffToProcess = matchingDiffs[0].diff;

        for (const a of diff.actions as IResourceAction[]) {
          promiseToApplyActions.push(a.handle(diffToProcess));
        }

        // Include the diff to process in the list of diffs processed in the same level.
        diffsProcessedInSameLevel.push(matchingDiffs[0]);
      }

      // Apply all actions of same level, since they can be applied in parallel.
      await Promise.all(promiseToApplyActions);

      // Mark metadata of each matching-diffs as applied.
      diffsInSameLevel.forEach((d) => (d.applied = true));

      // Add all diff in same level to transaction.
      transaction.push(diffsProcessedInSameLevel);

      processed += diffsInSameLevel.length;
      currentApplyOrder += 1;
    }

    return transaction;
  }

  private async diffResources(newResources: IActionOutputs, oldResources: IActionOutputs): Promise<Diff[]> {
    const newResourceKeys = Object.keys(newResources);
    const oldResourceKeys = Object.keys(oldResources);
    const diffs: Diff[] = [];

    for (const oldResourceId of oldResourceKeys) {
      if (newResources.hasOwnProperty(oldResourceId)) {
        const rDiff = await newResources[oldResourceId].diff(oldResources[oldResourceId]);
        diffs.push(...rDiff);
      } else {
        const model = oldResources[oldResourceId];
        diffs.push(new Diff(model, DiffAction.DELETE, 'resourceId', model.resourceId));
      }
    }

    for (const newResourceId of newResourceKeys) {
      const model = newResources[newResourceId];
      diffs.push(new Diff(model, DiffAction.ADD, 'resourceId', model.resourceId));
    }

    return diffs;
  }

  private getMatchingDiffs(diff: DiffMetadata, diffs: DiffMetadata[]): DiffMetadata[] {
    return diffs.filter(
      (d) => d.model.getContext() === diff.model.getContext() && d.field === diff.field && d.action === diff.action,
    );
  }

  private setApplyOrder(diff: DiffMetadata, diffs: DiffMetadata[], seen: DiffMetadata[] = []): void {
    // Detect circular dependencies.
    if (this.getMatchingDiffs(diff, seen).length > 0) {
      throw new Error('Found circular dependencies!');
    }

    // Skip processing diff that already has the applyOrder set.
    if (diff.applyOrder >= 0) {
      return;
    }

    // Get all dependencies where the subject model is a child. Resulting dependencies are parent.
    const dependencies = diff.model.getMatchingDependencies(diff.field, diff.action);
    const dependencyApplyOrders: number[] = [-1];

    dependencies.forEach((dependency) => {
      // Iterate diffs looking to match parent dependency on same field and action.
      const matchingDiffs = diffs.filter(
        (d) =>
          d.model.getContext() === dependency.to.getContext() &&
          dependency.hasMatchingBehavior(diff.field, diff.action, d.field, d.action),
      );

      // On each parent diff that should be processed first, apply order on it before than self.
      for (const matchingDiff of matchingDiffs) {
        this.setApplyOrder(matchingDiff, diffs, [...seen, diff]);
        dependencyApplyOrders.push(matchingDiff.applyOrder);
      }
    });

    diff.applyOrder = Math.max(...dependencyApplyOrders) + 1;
  }

  async *beginTransaction(
    diffs: Diff[],
    oldResources: IActionOutputs = {},
    newResources: IActionOutputs = {},
    options: TransactionOptions = {
      yieldModelTransaction: false,
      yieldResourceDiffs: false,
      yieldResourceTransaction: false,
    },
  ): AsyncGenerator {
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
    const modelTransaction = this.applyModels(modelDiffs, newResources);
    if (options.yieldModelTransaction) {
      yield modelTransaction;
    }

    // Generate diff on resources.
    diffs = await this.diffResources(newResources, oldResources);
    if (options.yieldResourceDiffs) {
      yield diffs;
    }

    // Set apply order on resource diffs.
    const resourceDiffs = diffs.map(
      (d) =>
        new DiffMetadata(
          d,
          this.resourceActions.filter((a) => a.filter(d)),
        ),
    );
    for (const diff of resourceDiffs) {
      this.setApplyOrder(diff, resourceDiffs);
    }

    // Apply resource diffs.
    const resourceTransaction = await this.applyResources(resourceDiffs);
    if (options.yieldResourceTransaction) {
      yield resourceTransaction;
    }
  }

  registerModelActions(actions: IAction<IActionInputs, IActionOutputs>[]): void {
    this.modelActions.push(...actions);
  }

  registerResourceActions(actions: IResourceAction[]): void {
    this.resourceActions.push(...actions);
  }

  registerInputs(inputs: IActionInputs): void {
    for (const key of Object.keys(inputs)) {
      this.inputs[key] = inputs[key];
    }
  }

  async *rollbackTransaction(
    modelTransaction: DiffMetadata[][],
    oldResources: IActionOutputs = {},
    newResources: IActionOutputs = {},
    options: TransactionOptions = {
      yieldModelTransaction: false,
      yieldResourceDiffs: false,
      yieldResourceTransaction: false,
    },
  ): AsyncGenerator {
    // Set revert on model diffs.
    for (let i = modelTransaction.length - 1; i >= 0; i--) {
      const diffsProcessedInSameLevel = modelTransaction[i];

      for (const diff of diffsProcessedInSameLevel) {
        for (const a of diff.actions as IAction<IActionInputs, IActionOutputs>[]) {
          const outputs = a.revert(diff.diff, diff.inputs, diff.outputs);
          const outputKeys = Object.keys(outputs);
          for (const outputKey of outputKeys) {
            newResources[outputKey] = outputs[outputKey];
          }
        }
      }
    }

    // Generate diff on resources.
    const diffs = await this.diffResources(oldResources, newResources);
    if (options.yieldResourceDiffs) {
      yield diffs;
    }

    // Set apply order on resource diffs.
    const resourceDiffs = diffs.map(
      (d) =>
        new DiffMetadata(
          d,
          this.resourceActions.filter((a) => a.filter(d)),
        ),
    );
    for (const diff of resourceDiffs) {
      this.setApplyOrder(diff, resourceDiffs);
    }

    // Apply resource diffs.
    const resourceTransaction = await this.applyResources(resourceDiffs);
    if (options.yieldResourceTransaction) {
      yield resourceTransaction;
    }
  }
}
