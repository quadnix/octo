import { IAction } from '../../models/action.interface';
import { Diff } from './diff.model';

export class DiffService {
  private readonly actions: IAction[] = [];
  private readonly transaction: Diff[][] = [];

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

    const dependencies = diff.model.getMatchingDependencies(diff.field, diff.action);
    const dependencyApplyOrders: number[] = [-1];

    dependencies.forEach((dependency) => {
      const matchingDiffs = diffs.filter(
        (d) =>
          d.model.getContext() === dependency.to.getContext() &&
          dependency.hasMatchingBehavior(diff.field, diff.action, d.field, d.action),
      );

      for (const matchingDiff of matchingDiffs) {
        this.setApplyOrder(matchingDiff, diffs, [...seen, diff]);
        dependencyApplyOrders.push(matchingDiff.metadata.applyOrder);
      }
    });

    diff.metadata.applyOrder = Math.max(...dependencyApplyOrders) + 1;
  }

  async beginTransaction(diffs: Diff[]): Promise<void> {
    for (const diff of diffs) {
      this.setApplyOrder(diff, diffs);
    }

    let accountedFor = 0;
    let currentApplyOrder = 0;
    while (accountedFor < diffs.length) {
      const diffsInSameLevel = diffs.filter((d) => d.metadata.applyOrder === currentApplyOrder);

      const promisesToApplyDiff: Promise<void>[] = [];
      for (const diff of diffsInSameLevel) {
        // Ensure at least one action can process this diff.
        const actions = this.actions.filter((a) => a.filter(diff));
        if (actions.length === 0) {
          throw new Error('No matching action found to process diff!');
        }

        // Check for similar unprocessed-diffs on the same model and same field.
        const matchingDiffs = this.getMatchingDiffs(diff, diffsInSameLevel);
        const unprocessedMatchingDiffs = matchingDiffs.filter((d) => !d.metadata.applied);

        // Enrich all unprocessed-matching-diffs with their actions.
        unprocessedMatchingDiffs.map((d) => (d.metadata.actions = actions));

        // Add all unprocessed-matching-diffs to transaction.
        this.transaction.push(unprocessedMatchingDiffs);

        // Apply the actions on each unprocessed-matching-diffs.
        actions.forEach((a) => {
          promisesToApplyDiff.push(a.handle(unprocessedMatchingDiffs));
        });

        // Mark metadata of each unprocessed-matching-diffs as applied.
        unprocessedMatchingDiffs.forEach((d) => (d.metadata.applied = true));
      }

      await Promise.all(promisesToApplyDiff);

      accountedFor += diffsInSameLevel.length;
      currentApplyOrder += 1;
    }
  }

  getActionNames(): string[] {
    return this.actions.map((a) => a.ACTION_NAME);
  }

  getTransaction(): ReturnType<Diff['toJSON']>[][] {
    const transaction: ReturnType<Diff['toJSON']>[][] = [];

    for (const transactionRow of this.transaction) {
      transaction.push(transactionRow.map((diff) => diff.toJSON()));
    }

    return transaction;
  }

  registerActions(actions: IAction[]): void {
    this.actions.push(...actions);
  }

  async rollback(): Promise<void> {
    for (let i = this.transaction.length - 1; i >= 0; i--) {
      const processedMatchingDiffs = this.transaction[i];
      if (processedMatchingDiffs.length === 0) {
        continue;
      }

      const promiseToRevertDiff: Promise<void>[] = [];
      const diff = processedMatchingDiffs[0];

      // Apply the actions on each unprocessed-matching-diffs.
      diff.metadata.actions.forEach((a) => {
        promiseToRevertDiff.push(a.revert(processedMatchingDiffs));
      });

      await Promise.all(promiseToRevertDiff);

      // Mark metadata of each processed-matching-diffs as un-applied.
      processedMatchingDiffs.forEach((d) => (d.metadata.applied = false));
    }
  }
}
