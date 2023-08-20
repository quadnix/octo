import { IAction, IActionInputs, IActionOutputs } from '../../models/action.interface';
import { Diff } from '../../functions/diff/diff.model';

export class DiffService {
  private readonly actions: IAction<IActionInputs, IActionOutputs>[] = [];
  private readonly inputs: IActionInputs = {};
  private readonly outputs: IActionOutputs = {};

  private getMatchingDiffs(diff: Diff, diffs: Diff[]): Diff[] {
    return diffs.filter(
      (d) => d.model.getContext() === diff.model.getContext() && d.field === diff.field && d.action === diff.action,
    );
  }

  private setApplyOrder(diff: Diff, diffs: Diff[], seen: Diff[] = []): void {
    // Detect circular dependencies.
    if (this.getMatchingDiffs(diff, seen).length > 0) {
      throw new Error('Found circular dependencies!');
    }

    // Skip processing diff that already has the applyOrder set.
    if (diff.metadata.applyOrder >= 0) {
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
        dependencyApplyOrders.push(matchingDiff.metadata.applyOrder);
      }
    });

    diff.metadata.applyOrder = Math.max(...dependencyApplyOrders) + 1;
  }

  async beginTransaction(diffs: Diff[]): Promise<Diff[][]> {
    const transaction: Diff[][] = [];

    // Validate diff action(s).
    for (const diff of diffs) {
      const actions = this.actions.filter((a) => a.filter(diff));
      if (actions.length === 0) {
        throw new Error('No matching action found to process diff!');
      }
    }

    for (const diff of diffs) {
      this.setApplyOrder(diff, diffs);
    }

    let accountedFor = 0;
    let currentApplyOrder = 0;
    while (accountedFor < diffs.length) {
      const diffsInSameLevel = diffs.filter((d) => d.metadata.applyOrder === currentApplyOrder);
      const diffsProcessedInSameLevel: Diff[] = [];

      for (const diff of diffsInSameLevel) {
        const actions = this.actions.filter((a) => a.filter(diff));

        // Check for similar diffs on the same model and same field.
        const matchingDiffs = this.getMatchingDiffs(diff, diffsInSameLevel);

        // Enrich all matching-diffs with their actions.
        matchingDiffs.map((d) => (d.metadata.actions = actions));

        // Mark metadata of each matching-diffs as applied.
        matchingDiffs.forEach((d) => (d.metadata.applied = true));

        // Only process the first diff, given all matching-diffs are the same.
        const diffToProcess = matchingDiffs[0];

        for (const a of actions) {
          // Resolve input requests.
          const inputs: IActionInputs = {};
          const inputKeys = a.collectInput(diffToProcess);
          inputKeys.map((k) => {
            if ((k as string).startsWith('resource')) {
              inputs[k] = this.outputs[k];
            } else {
              inputs[k] = this.inputs[k];
            }
          });

          // Apply all actions on the diff.
          const outputs = a.handle(diffToProcess, inputs);
          for (const output of a.collectOutput(diffToProcess)) {
            this.outputs[output] = outputs[output];
          }
        }

        // Include the diff to process in the list of diffs processed in the same level.
        diffsProcessedInSameLevel.push(diffToProcess);
      }

      // Add all diff in same level to transaction.
      transaction.push(diffsProcessedInSameLevel);

      accountedFor += diffsInSameLevel.length;
      currentApplyOrder += 1;
    }

    return transaction;
  }

  getActionNames(): string[] {
    return this.actions.map((a) => a.ACTION_NAME);
  }

  registerActions(actions: IAction<IActionInputs, IActionOutputs>[]): void {
    this.actions.push(...actions);
  }

  registerInputs(inputs: IActionInputs): void {
    for (const key of Object.keys(inputs)) {
      this.inputs[key] = inputs[key];
    }
  }

  async rollbackAll(transaction: Diff[][]): Promise<void> {
    for (let i = transaction.length - 1; i >= 0; i--) {
      const diffsProcessedInSameLevel = transaction[i];

      for (const diff of diffsProcessedInSameLevel) {
        // Apply revert on all actions of the diff.
        diff.metadata.actions.forEach((a) => {
          const outputs = a.revert(diff);
          for (const output of a.collectOutput(diff)) {
            this.outputs[output] = outputs[output];
          }
        });
      }

      // Mark each diff metadata as un-applied.
      diffsProcessedInSameLevel.forEach((d) => (d.metadata.applied = false));
    }
  }
}