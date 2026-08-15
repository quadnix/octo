import type { TerraformFolderOutput, TerraformResourceOutput, UnknownResource } from '../app.type.js';
import { TransactionError } from '../errors/index.js';
import type { CommitModeCompletedEvent } from '../events/index.js';
import { Container } from '../functions/container/container.js';
import { aggregateResourceActions } from '../functions/diff/aggregate-resource-actions.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { ResourceDataRepository } from '../resources/resource-data.repository.js';
import { TerraformService } from '../services/terraform/terraform.service.js';
import { TransactionService } from '../services/transaction/transaction.service.js';
import type { ModelTransactionResult } from './apply-transaction.js';

export type TerraformOutputs = Record<string, { value: unknown }>;

/**
 * Records a terraform apply back into octo's state: Committed ← Cloud. The catch-up step of the
 * cycle, not a drift resolver.
 *
 * Operates on the resource graph the `transaction` already built: reads every module folder's outputs
 * from the caller-supplied `outputs` map (keyed by module id), populates resource responses by the
 * `${resourceId}-${key}` convention, and syncs the actual graph to the new graph.
 *
 * Rejects — all-or-nothing, throwing before any mutation: a declared output that is missing
 * (partial apply) or carries a null value (broken apply). Outputs are demanded only for the
 * modules the sweep filled — never for an emptied (deleted) folder, whose destroy simply drops its
 * resources from the committed state. Warns: outputs supplied for a folder that is neither in
 * intent nor in the committed folder record (`previousFolders`) are ignored — octo never fails on,
 * or touches, a folder it does not recognize; re-declaring the module in intent re-adopts it.
 *
 * Returns the model transaction so {@link Octo} can run the persistence + commit hooks it owns,
 * plus a description of what was committed for the caller to emit and surface.
 *
 * `previousMappings` is the octo→terraform mapping persisted by the last commit. It supplies the
 * module and addresses of resources being deleted, which this run's sweep no longer renders.
 *
 * @internal
 */
export async function commit({
  outputs,
  previousFolders = [],
  previousMappings = [],
  transaction,
}: {
  outputs: Map<string, TerraformOutputs>;
  previousFolders?: TerraformFolderOutput[];
  previousMappings?: TerraformResourceOutput[];
  transaction: ModelTransactionResult;
}): Promise<{
  emptiedModuleIds: string[];
  modelTransaction: DiffMetadata[][];
  resources: CommitModeCompletedEvent['payload']['resources'];
  responses: { key: string; previousValue?: string; resourceContext: string; value: string }[];
  warnings: { message: string; moduleId?: string }[];
}> {
  const container = Container.getInstance();
  const [resourceDataRepository, terraformService, transactionService] = await Promise.all([
    container.get(ResourceDataRepository),
    container.get(TerraformService),
    container.get(TransactionService),
  ]);

  const { modelTransaction } = transaction;

  const mappings = terraformService.getOctoTerraformResourceMappings();

  // Read every filled module folder's outputs from the caller-supplied map.
  const outputsByModule = new Map<string, TerraformOutputs>();
  for (const moduleId of terraformService.getModuleIds()) {
    const moduleOutputs = outputs.get(moduleId);
    if (moduleOutputs === undefined) {
      throw new TransactionError(`No terraform outputs provided for module "${moduleId}"!`);
    }
    outputsByModule.set(moduleId, moduleOutputs);
  }

  // Outputs for a folder octo does not track (not in intent, not in the committed folder record)
  // are ignored: warn, never reject. Tracked-but-emptied folders pass silently — their outputs
  // (if any) are simply not demanded or read.
  const warnings: { message: string; moduleId?: string }[] = [];
  const trackedModuleIds = new Set([
    ...terraformService.getModuleIds(),
    ...previousFolders.map((folder) => folder.moduleId),
  ]);
  for (const moduleId of outputs.keys()) {
    if (!trackedModuleIds.has(moduleId)) {
      warnings.push({
        message:
          `Terraform outputs supplied for folder "${moduleId}", which octo does not track (not in intent or committed ` +
          'state); ignoring it. Re-declare its module in intent to re-adopt it.',
        moduleId,
      });
    }
  }

  // Populate responses; collect all missing and null outputs before failing. Non-null values are
  // coerced to string to honor the flat-string response contract; a null value is rejected — no
  // resource legitimately emits one, so it signals a broken apply and must not corrupt octo state.
  const missingOutputs: string[] = [];
  const nullOutputs: string[] = [];
  const responseUpdates: { key: string; resource: UnknownResource; value: string }[] = [];
  for (const mapping of mappings) {
    const resource = resourceDataRepository.getNewResourceByContext(mapping.resourceContext);
    if (!resource) {
      continue;
    }

    const outputs = outputsByModule.get(mapping.moduleId) ?? {};

    if (mapping.entireResponseOutput !== undefined) {
      const outputName = mapping.entireResponseOutput;
      if (!(outputName in outputs)) {
        missingOutputs.push(`${mapping.moduleId}/${outputName}`);
      } else if (outputs[outputName].value === null || outputs[outputName].value === undefined) {
        nullOutputs.push(`${mapping.moduleId}/${outputName}`);
      } else {
        const wholeResponse = outputs[outputName].value as Record<string, unknown>;
        for (const [key, value] of Object.entries(wholeResponse)) {
          if (value === null || value === undefined) {
            nullOutputs.push(`${mapping.moduleId}/${outputName}.${key}`);
          } else {
            responseUpdates.push({ key, resource, value: String(value) });
          }
        }
      }
      continue;
    }

    for (const { key, outputName } of mapping.outputMappings) {
      if (!(outputName in outputs)) {
        missingOutputs.push(`${mapping.moduleId}/${outputName}`);
      } else if (outputs[outputName].value === null || outputs[outputName].value === undefined) {
        nullOutputs.push(`${mapping.moduleId}/${outputName}`);
      } else {
        responseUpdates.push({ key, resource, value: String(outputs[outputName].value) });
      }
    }
  }

  if (missingOutputs.length > 0) {
    throw new TransactionError(
      `Cannot commit: missing terraform outputs (partial apply?): ${missingOutputs.join(', ')}! ` +
        'Octo state is unchanged.',
    );
  }
  if (nullOutputs.length > 0) {
    throw new TransactionError(
      `Cannot commit: null terraform outputs (broken apply?): ${nullOutputs.join(', ')}! ` +
        'A declared output must carry a value. Octo state is unchanged.',
    );
  }

  // Capture the previous value before overwriting.
  const responses: { key: string; previousValue?: string; resourceContext: string; value: string }[] = [];
  for (const { key, resource, value } of responseUpdates) {
    const previousValue = resource.response[key];
    responses.push({
      key,
      previousValue: previousValue === undefined ? undefined : String(previousValue),
      resourceContext: resource.getContext(),
      value,
    });
    resource.response[key] = value;
  }

  // Tell every deleted external resource to delete itself, before anything is recorded.
  //
  // Terraform cannot: octo deletes a resource by removing its block from the configuration, and
  // terraform will not run a `when = destroy` provisioner for a resource that is no longer in the
  // configuration - it drops the `null_resource` from state and moves on, so the callback never
  // fires. Without this the real thing outlives both state files with nothing tracking it.
  //
  // Placed before the sync deliberately. A delete that throws aborts the commit with octo state
  // untouched, so the resource is still recorded as present and the deletion is retried next run.
  await transactionService.applyExternalResourceDeletes(transaction.resourceDiffs);

  // Terraform has applied the full desired state: actual ← new.
  resourceDataRepository.syncActualToNew();

  // Describe what was committed. Addresses come from this run's sweep, falling back to the last
  // commit's mapping for deleted resources, which the sweep no longer renders.
  const mappingByContext = new Map(mappings.map((mapping) => [mapping.resourceContext, mapping]));
  const previousByContext = new Map(previousMappings.map((mapping) => [mapping.resourceContext, mapping]));

  const resources = [...aggregateResourceActions(transaction.resourceDiffs.flat()).entries()].map(
    ([resourceContext, action]) => {
      const mapping = mappingByContext.get(resourceContext) ?? previousByContext.get(resourceContext);
      return {
        action: action.action,
        moduleId: mapping?.moduleId,
        reason: action.reason,
        resourceContext,
        resourceId: action.resourceId,
        terraformAddresses: mapping?.terraformAddresses ?? [],
      };
    },
  );

  const writtenModuleIds = terraformService.getModuleIds();
  const emptiedModuleIds = previousFolders
    .map((folder) => folder.moduleId)
    .filter((moduleId) => !writtenModuleIds.includes(moduleId));

  return { emptiedModuleIds, modelTransaction, resources, responses, warnings };
}
