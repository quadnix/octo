import type { TerraformFolderOutput, UnknownResource } from '../app.type.js';
import { TransactionError } from '../errors/index.js';
import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import type { App } from '../models/app/app.model.js';
import { ResourceDataRepository } from '../resources/resource-data.repository.js';
import { TerraformService } from '../services/terraform/terraform.service.js';
import { TransactionService } from '../services/transaction/transaction.service.js';

type TerraformOutputs = Record<string, { value: unknown }>;

/**
 * Maps a terraform apply's outputs back onto the new resource graph's responses.
 *
 * Boots normally (modules → model actions → resource graph), reads every module folder's outputs
 * from the caller-supplied `outputs` map (keyed by module id), populates resource responses by the
 * `${resourceId}-${key}` convention, and syncs the actual graph to the new graph. All-or-nothing:
 * if any expected output is missing (e.g. partial apply), errors before mutating anything.
 *
 * Outputs are demanded only for the modules the sweep filled — never for an emptied (deleted)
 * folder, whose destroy simply drops its resources from the committed state. Outputs supplied for
 * a folder that is neither in intent nor in the committed folder record (`previousFolders`) are
 * ignored with a **not-tracked** warning — octo never fails on, or touches, a folder it does not
 * recognize.
 *
 * Returns the model transaction so {@link Octo} can run the persistence + commit hooks it owns,
 * plus the warnings for the caller to surface.
 *
 * @internal
 */
export async function commit(
  app: App,
  {
    outputs,
    previousFolders = [],
  }: { outputs: Map<string, TerraformOutputs>; previousFolders?: TerraformFolderOutput[] },
): Promise<{ modelTransaction: DiffMetadata[][]; warnings: { message: string; moduleId?: string }[] }> {
  const container = Container.getInstance();
  const [resourceDataRepository, terraformService, transactionService] = await Promise.all([
    container.get(ResourceDataRepository),
    container.get(TerraformService),
    container.get(TransactionService),
  ]);

  const diffs = await app.diff();
  const transaction = transactionService.beginTransaction(diffs, {
    generateTerraform: true,
    yieldModelTransaction: true,
    yieldResourceDiffs: true,
  });

  const modelTransaction = await transaction.next();
  // Advance past terraform generation and resource diff computation. No resource actions run.
  await transaction.next();

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

  // Populate responses; collect all missing outputs before failing. Values are coerced to string
  // to honor the flat-string response contract.
  const missingOutputs: string[] = [];
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
      } else {
        const wholeResponse = (outputs[outputName].value ?? {}) as Record<string, unknown>;
        for (const [key, value] of Object.entries(wholeResponse)) {
          responseUpdates.push({ key, resource, value: String(value) });
        }
      }
      continue;
    }

    for (const { key, outputName } of mapping.outputMappings) {
      if (!(outputName in outputs)) {
        missingOutputs.push(`${mapping.moduleId}/${outputName}`);
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

  for (const { key, resource, value } of responseUpdates) {
    resource.response[key] = value;
  }

  // Terraform has applied the full desired state: actual ← new.
  resourceDataRepository.syncActualToNew();

  return { modelTransaction: modelTransaction.value as DiffMetadata[][], warnings };
}
