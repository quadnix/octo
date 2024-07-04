import { type App, type DiffMetadata, type TransactionOptions } from '@quadnix/octo';
import { type OctoAws } from '../../src/index.js';

export async function commit(
  octoAws: OctoAws,
  app: App,
  { onlyModels = false }: { onlyModels?: boolean } = {},
): Promise<DiffMetadata[][]> {
  const diffs = await octoAws.diff(app);

  const transactionOptions: TransactionOptions = onlyModels
    ? { yieldModelTransaction: true }
    : { yieldResourceTransaction: true };
  const generator = await octoAws.beginTransaction(diffs, transactionOptions);

  if (onlyModels) {
    const modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult.value);
    return modelTransactionResult.value;
  } else {
    const resourceTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
    const modelTransactionResult = (await generator.next()) as IteratorResult<DiffMetadata[][]>;
    await octoAws.commitTransaction(app, modelTransactionResult.value);
    return resourceTransactionResult.value;
  }
}
