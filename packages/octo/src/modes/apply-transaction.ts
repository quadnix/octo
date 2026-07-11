import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import type { App } from '../models/app/app.model.js';
import { TransactionService } from '../services/transaction/transaction.service.js';

/**
 * The result of applying the model transaction once: the model transaction and the resource diffs,
 * with the resource graph built and swept into terraform as a side effect. `commit` consumes the
 * model transaction; `generate` and `validate` consume the resource diffs.
 */
export interface ModelTransactionResult {
  modelTransaction: DiffMetadata[][];
  resourceDiffs: DiffMetadata[][];
}

/**
 * Applies the model transaction: derives the full resource graph from intent (running every model
 * action once) and sweeps it into terraform, returning the model transaction and resource diffs.
 *
 * This is the single "build" step of a lifecycle. In production each of generate/validate/commit is
 * a separate process and builds its own; a single-process driver (e.g. the test harness) can build
 * once and hand the same {@link ModelTransactionResult} to all three modes, so the graph is derived
 * once rather than three times. No resource actions run here — that is `generateTerraform`'s path.
 *
 * @internal
 */
export async function applyModelTransaction(app: App): Promise<ModelTransactionResult> {
  const transactionService = await Container.getInstance().get(TransactionService);

  const transaction = transactionService.beginTransaction(await app.diff(), {
    generateTerraform: true,
    yieldModelTransaction: true,
    yieldResourceDiffs: true,
  });

  const modelTransaction = (await transaction.next()).value as DiffMetadata[][];
  const resourceDiffs = (await transaction.next()).value as DiffMetadata[][];

  return { modelTransaction, resourceDiffs };
}
