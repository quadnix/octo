import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'path';
import type { TerraformFolderOutput } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { TerraformService } from '../services/terraform/terraform.service.js';
import type { ModelTransactionResult } from './apply-transaction.js';

/**
 * Generates terragrunt module folders representing the full desired state: Folders ← Intent.
 *
 * Renders the resource graph the `transaction` already built — every resource contributed to
 * terraform (terraform resources via `toHCL()`, external resources via the `null_resource` wrapper) — and
 * writes one folder per octo module. Persists nothing to octo state; the returned resource
 * diffs are a review artifact only. (An author's refusal in a `diff*` method surfaces earlier, when
 * {@link applyModelTransaction} builds the transaction, so no folder is ever written from a bad graph.)
 *
 * `previousFolders` is the folder record persisted by previous runs (the caller reads it from
 * `models.json` ∪ `resources.json`). A recorded folder the sweep does not produce was deleted from
 * intent, and is written **emptied** — no resources, but the recorded provider blocks intact — so
 * terragrunt still discovers it and a later apply destroys whatever its state holds (and cannot
 * redeploy it). Folders are emptied, never removed.
 *
 * Writes are gentle: each folder is overwritten in place, and `outputDir` is not wiped, so
 * `terraform.tfstate`, `.terragrunt-cache`, and any folder octo does not recognize (a user's own, or
 * an emptied leftover) are preserved across runs.
 *
 * @internal
 */
export async function generate({
  outputDir,
  previousFolders = [],
  transaction,
}: {
  outputDir: string;
  previousFolders?: TerraformFolderOutput[];
  transaction: ModelTransactionResult;
}): Promise<DiffMetadata[][]> {
  const terraformService = await Container.getInstance().get(TerraformService);

  const { resourceDiffs } = transaction;

  const moduleFiles = terraformService.renderAllModules();

  // Write rule: a recorded folder the sweep did not produce was deleted from intent — add it to
  // the write set emptied, with the providers recorded by the last run.
  for (const folder of previousFolders) {
    if (!moduleFiles.has(folder.moduleId)) {
      moduleFiles.set(folder.moduleId, terraformService.renderEmptyModule(folder));
    }
  }

  // Overwrite each module folder in place. The output directory is not wiped, so terraform state,
  // caches, and unrelated folders survive a regenerate.
  for (const [moduleId, files] of moduleFiles.entries()) {
    const moduleDir = join(outputDir, moduleId);
    await mkdir(moduleDir, { recursive: true });
    await writeFile(join(moduleDir, 'main.tf'), files.mainTf, 'utf-8');
    await writeFile(join(moduleDir, 'variables.tf'), files.variablesTf, 'utf-8');
    await writeFile(join(moduleDir, 'outputs.tf'), files.outputsTf, 'utf-8');
    await writeFile(join(moduleDir, 'terragrunt.hcl'), files.terragruntHcl, 'utf-8');
  }

  return resourceDiffs;
}
