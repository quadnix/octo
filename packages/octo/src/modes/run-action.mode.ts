import { readFile } from 'node:fs/promises';
import type { UnknownResource } from '../app.type.js';
import { TransactionError } from '../errors/index.js';
import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { DiffAction } from '../functions/diff/diff.js';
import type { App } from '../models/app/app.model.js';
import { ResourceDataRepository } from '../resources/resource-data.repository.js';
import { AResource } from '../resources/resource.abstract.js';
import { ATerraformResource } from '../resources/terraform-resource.abstract.js';
import { TransactionService } from '../services/transaction/transaction.service.js';

interface RunActionResult {
  action: 'add' | 'delete' | 'noop' | 'update';
  resourceId: string;
  response: Record<string, string>;
}

/**
 * Runs a single resource action, invoked by terraform mid-apply for an external resource.
 *
 * Boots normally, computes the full resource diff, filters to `resourceId` — the diff decides
 * whether this is an add, update, delete, or noop. Explicit `inputs`
 * (`<parentResourceId>.<responseKey>` keys) are injected into the parent resources' responses in
 * memory before the action runs. Fully stateless: never writes octo state.
 *
 * @internal
 */
export async function runAction(
  app: App,
  {
    inputs = {},
    inputsFilePath = undefined,
    resourceId,
  }: { inputs?: Record<string, unknown>; inputsFilePath?: string; resourceId: string },
): Promise<RunActionResult> {
  const container = Container.getInstance();
  const [resourceDataRepository, transactionService] = await Promise.all([
    container.get(ResourceDataRepository),
    container.get(TransactionService),
  ]);

  // Sensitive values arrive via a file instead of inline args; file values take precedence.
  if (inputsFilePath) {
    const fileContent = await readFile(inputsFilePath, 'utf-8');
    inputs = { ...inputs, ...JSON.parse(fileContent) };
  }

  const diffs = await app.diff();
  const transaction = transactionService.beginTransaction(diffs, {
    filterResourceDiffsByResourceId: resourceId,
    skipActualResourceUpdate: true,
    yieldResourceDiffs: true,
    yieldResourceTransaction: true,
  });

  const resourceDiffs = await transaction.next();
  const allDiffs = (resourceDiffs.value as DiffMetadata[][]).flat();

  // A terraform resource is managed by terraform and must never be run via run-action.
  // Guard both paths: a changed resource surfaces in `allDiffs`; an unchanged one has no diff at all,
  // so we also check the resource in the new graph directly.
  const targetResource = resourceDataRepository
    .getNewResourcesByProperties()
    .find((r) => r.resourceId === resourceId && !r.isMarkedDeleted());
  if (targetResource instanceof ATerraformResource || allDiffs.some((d) => d.node instanceof ATerraformResource)) {
    throw new TransactionError(`Resource "${resourceId}" is a terraform resource and cannot be run via run-action!`);
  }

  if (allDiffs.length === 0) {
    // Noop: still report the current response so terraform captures consistent outputs.
    return { action: 'noop', resourceId, response: targetResource?.response ?? {} };
  }

  // Inject explicit inputs into the parent resources the actions will read. An input is keyed
  // either as "<parentId>.<key>" (one response key, from a native parent) or bare "<parentId>"
  // (an external parent's entire response map, passed as one JSON object — its keys aren't
  // enumerable at generation time). Inputs not matching a parent are ignored.
  for (const diff of allDiffs) {
    const node = diff.node as UnknownResource;
    for (const parent of node.parents) {
      const parentResource = parent instanceof AResource ? parent : parent.getActual();
      for (const [inputKey, inputValue] of Object.entries(inputs)) {
        const separatorIndex = inputKey.indexOf('.');
        if (separatorIndex === -1) {
          if (inputKey === parentResource.resourceId) {
            const wholeResponse = typeof inputValue === 'string' ? JSON.parse(inputValue) : inputValue;
            Object.assign(parentResource.response, wholeResponse);
          }
        } else if (inputKey.substring(0, separatorIndex) === parentResource.resourceId) {
          parentResource.response[inputKey.substring(separatorIndex + 1)] = inputValue;
        }
      }
    }
  }

  // Run the action.
  await transaction.next();

  const action: RunActionResult['action'] = allDiffs.some(
    (d) => d.action === DiffAction.DELETE && d.field === 'resourceId',
  )
    ? 'delete'
    : allDiffs.some((d) => d.action === DiffAction.ADD && d.field === 'resourceId')
      ? 'add'
      : 'update';

  if (action === 'delete') {
    return { action, resourceId, response: {} };
  }

  const targetContext = (allDiffs[0].node as UnknownResource).getContext();
  const resource = resourceDataRepository.getNewResourceByContext(targetContext);
  return { action, resourceId, response: resource?.response ?? {} };
}
