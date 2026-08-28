import type { UnknownResource } from '../app.type.js';
import { TransactionError } from '../errors/index.js';
import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { DiffAction } from '../functions/diff/diff.js';
import type { App } from '../models/app/app.model.js';
import { ResourceDataRepository } from '../resources/resource-data.repository.js';
import { AResource } from '../resources/resource.abstract.js';
import { ATerraformResource } from '../resources/terraform-resource.abstract.js';
import { StateManagementService } from '../services/state-management/state-management.service.js';
import { TransactionService } from '../services/transaction/transaction.service.js';

interface RunActionResult {
  action: 'add' | 'delete' | 'noop' | 'update';
  resourceId: string;
  response: Record<string, string>;
}

/**
 * Flattens a resource response to the strings terraform's `data "external"` protocol accepts - it
 * takes a JSON object of strings and nothing else, so an action returning `{ Port: 80 }` fails the
 * apply. This is the same contract {@link commit} enforces on the way back in, applied here so the
 * CLI and the commit path cannot disagree.
 *
 * A `null`/`undefined` value is rejected rather than emitted as `"null"`: no resource legitimately
 * emits one, so it signals a broken action, and the string would otherwise land in octo state at
 * the next commit.
 */
function toFlatStringResponse(resourceId: string, response: Record<string, unknown>): Record<string, string> {
  const flatResponse: Record<string, string> = {};
  const nullKeys: string[] = [];

  for (const [key, value] of Object.entries(response)) {
    if (value === null || value === undefined) {
      nullKeys.push(key);
    } else {
      flatResponse[key] = String(value);
    }
  }

  if (nullKeys.length > 0) {
    throw new TransactionError(
      `Resource "${resourceId}" returned null response values: ${nullKeys.join(', ')}! ` +
        'Every response key must carry a value.',
    );
  }

  return flatResponse;
}

/**
 * Runs a single resource action, invoked by terraform mid-apply for an external resource.
 *
 * Octo-internal: not a step of the user's generate → validate → apply → commit cycle — terraform
 * shells back into it from a generated `local-exec` provisioner; users never run it by hand.
 *
 * Boots normally, computes the full resource diff, filters to `resourceId` — the diff decides
 * whether this is an add, update, delete, or noop. Explicit `inputs`
 * (`<parentResourceId>.<responseKey>` keys) are injected into the parent resources' responses in
 * memory before the action runs. Rejects a `resourceId` that is not an external resource.
 *
 * The response it publishes is recorded against the resource, and a delete clears that record. That
 * record is the only copy of the response until `commit` folds it into the resource graph, and it is
 * what a later plan reads back. Nothing else in octo state is touched.
 *
 * @internal
 */
export async function runAction(
  app: App,
  { inputs = {}, resourceId }: { inputs?: Record<string, unknown>; resourceId: string },
): Promise<RunActionResult> {
  const container = Container.getInstance();
  const [resourceDataRepository, stateManagementService, transactionService] = await Promise.all([
    container.get(ResourceDataRepository),
    container.get(StateManagementService),
    container.get(TransactionService),
  ]);

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
    return { action: 'noop', resourceId, response: toFlatStringResponse(resourceId, targetResource?.response ?? {}) };
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
    await stateManagementService.deleteExternalResourceResponse(resourceId);
    return { action, resourceId, response: {} };
  }

  // Record what was published, so a plan running before the next commit can still read it.
  const targetContext = (allDiffs[0].node as UnknownResource).getContext();
  const resource = resourceDataRepository.getNewResourceByContext(targetContext);
  const response = toFlatStringResponse(resourceId, resource?.response ?? {});
  await stateManagementService.saveExternalResourceResponse(resourceId, response);

  return { action, resourceId, response };
}
