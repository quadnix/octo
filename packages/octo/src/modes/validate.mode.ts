import { readFile } from 'node:fs/promises';
import { join } from 'path';
import type { UnknownResource } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import type { DiffMetadata } from '../functions/diff/diff-metadata.js';
import { DiffAction } from '../functions/diff/diff.js';
import type { App } from '../models/app/app.model.js';
import { TerraformService } from '../services/terraform/terraform.service.js';
import { TransactionService } from '../services/transaction/transaction.service.js';

/**
 * One resource's octo→terraform mapping, persisted at commit so a later validate can recover the
 * exact terraform addresses (and owning module) of resources that have since been deleted — they
 * are gone from the freshly generated files, but were present at the last apply.
 */
export interface PersistedTerraformMapping {
  moduleId: string;
  resourceContext: string;
  resourceId: string;
  terraformAddresses: string[];
}

interface ValidateResult {
  errors: { message: string; moduleId?: string }[];
  pass: boolean;
  warnings: { message: string; moduleId?: string }[];
}

/**
 * Compares octo's resource diff against terraform plans, bidirectionally.
 * Expects each generated module folder to contain a `plan.json` (`terraform show -json <plan-file>`). Writes nothing.
 *
 * `persistedMappings` is the octo→terraform mapping captured by the last commit,
 * used to recover the addresses of resources that have since
 * been deleted (and so are absent from this boot's generated files).
 *
 * @internal
 */
export async function validate(
  app: App,
  { persistedMappings, tfDir }: { persistedMappings: Map<string, PersistedTerraformMapping>; tfDir: string },
): Promise<ValidateResult> {
  const container = Container.getInstance();
  const [terraformService, transactionService] = await Promise.all([
    container.get(TerraformService),
    container.get(TransactionService),
  ]);

  const diffs = await app.diff();
  const transaction = transactionService.beginTransaction(diffs, {
    generateTerraform: true,
    yieldResourceDiffs: true,
  });

  const resourceDiffs = await transaction.next();
  const allDiffs = (resourceDiffs.value as DiffMetadata[][]).flat();

  const mappings = terraformService.getOctoTerraformResourceMappings();

  const errors: ValidateResult['errors'] = [];
  const warnings: ValidateResult['warnings'] = [];

  // Aggregate octo diffs to one action per resource. A resourceId add/delete is definitive; a
  // REPLACE (author-declared recreate, on any field) dominates a plain update; otherwise the
  // resource is an update.
  const octoActions = new Map<
    string,
    { action: DiffAction.ADD | DiffAction.DELETE | DiffAction.REPLACE | DiffAction.UPDATE; resourceId: string }
  >();
  for (const diff of allDiffs) {
    const node = diff.node as UnknownResource;
    const context = node.getContext();
    if (diff.action === DiffAction.DELETE && diff.field === 'resourceId') {
      octoActions.set(context, { action: DiffAction.DELETE, resourceId: node.resourceId });
    } else if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      octoActions.set(context, { action: DiffAction.ADD, resourceId: node.resourceId });
    } else if (diff.action === DiffAction.REPLACE) {
      const existing = octoActions.get(context);
      if (!existing || existing.action === DiffAction.UPDATE) {
        octoActions.set(context, { action: DiffAction.REPLACE, resourceId: node.resourceId });
      }
    } else if (!octoActions.has(context)) {
      octoActions.set(context, { action: DiffAction.UPDATE, resourceId: node.resourceId });
    }
  }

  // Read every module folder's plan.
  const planChangesByModule = new Map<string, Map<string, string[]>>();
  for (const moduleId of terraformService.getModuleIds()) {
    const planPath = join(tfDir, moduleId, 'plan.json');
    let planContent: string;
    try {
      planContent = await readFile(planPath, 'utf-8');
    } catch (error) {
      errors.push({ message: `Cannot read terraform plan at "${planPath}"!`, moduleId });
      continue;
    }

    const plan = JSON.parse(planContent);
    const changes = new Map<string, string[]>();
    for (const resourceChange of plan.resource_changes ?? []) {
      if (resourceChange.mode === 'data') {
        continue;
      }
      changes.set(resourceChange.address, resourceChange.change?.actions ?? []);
    }
    planChangesByModule.set(moduleId, changes);
  }

  const isNoop = (actions: string[]): boolean =>
    actions.length === 0 || (actions.length === 1 && (actions[0] === 'no-op' || actions[0] === 'read'));
  const matchesAction = (
    octoAction: DiffAction.ADD | DiffAction.DELETE | DiffAction.REPLACE | DiffAction.UPDATE,
    tfActions: string[],
  ): boolean => {
    const joined = [...tfActions].sort().join(',');
    if (octoAction === DiffAction.ADD) {
      return joined === 'create';
    }
    if (octoAction === DiffAction.DELETE) {
      return joined === 'delete';
    }
    if (octoAction === DiffAction.REPLACE) {
      // An author-declared replace must surface in terraform as a recreate, not an in-place update.
      return joined === 'create,delete';
    }
    // Updates may surface in terraform as in-place updates or replacements.
    return joined === 'update' || joined === 'create,delete' || joined === 'create';
  };

  const claimedAddresses = new Map<string, Set<string>>();
  const claim = (moduleId: string, address: string): void => {
    if (!claimedAddresses.has(moduleId)) {
      claimedAddresses.set(moduleId, new Set());
    }
    claimedAddresses.get(moduleId)!.add(address);
  };

  // Replace diff cascade: terraform recreates everything that (transitively) references a replaced
  // resource (force-new). Collect those referrers so their expected terraform changes are not
  // flagged as unattributed. Octo's diff graph stays minimal — only the replaced resource carries
  // the REPLACE; the cascade lives here, reusing the exact reference graph terraform cascades along.
  const replacedResourceIds = new Set(
    [...octoActions.values()].filter((a) => a.action === DiffAction.REPLACE).map((a) => a.resourceId),
  );
  const referrers = terraformService.getResourceReferrers();
  const cascadeAffectedResourceIds = new Set<string>();
  const cascadeQueue = [...replacedResourceIds];
  while (cascadeQueue.length > 0) {
    const referentId = cascadeQueue.shift()!;
    for (const referrerId of referrers.get(referentId) ?? []) {
      if (!cascadeAffectedResourceIds.has(referrerId) && !replacedResourceIds.has(referrerId)) {
        cascadeAffectedResourceIds.add(referrerId);
        cascadeQueue.push(referrerId);
      }
    }
  }

  const describeChanges = (changed: { address: string; tfActions: string[] }[]): string =>
    changed.map((c) => `[${c.tfActions.join(', ')}] on "${c.address}"`).join('; ');

  // Forward: correlation is resource-level — octo cannot be finer than "this resource changed in
  // some way". A resource octo flagged must have at least one terraform change consistent with its
  // action (a partial change leaving sibling addresses no-op is fine). A resource octo did not flag
  // must have no terraform change — unless it is a cascade referrer of a replace.
  for (const mapping of mappings) {
    const octoAction = octoActions.get(mapping.resourceContext);
    const planChanges = planChangesByModule.get(mapping.moduleId);
    if (!planChanges) {
      continue;
    }

    const addressActions = mapping.terraformAddresses.map((address) => {
      claim(mapping.moduleId, address);
      return { address, tfActions: planChanges.get(address) ?? [] };
    });
    const changed = addressActions.filter((a) => !isNoop(a.tfActions));

    if (!octoAction) {
      if (changed.length > 0 && !cascadeAffectedResourceIds.has(mapping.resourceId)) {
        errors.push({
          message: `Resource "${mapping.resourceId}" has no octo diff, but terraform plans ${describeChanges(changed)}!`,
          moduleId: mapping.moduleId,
        });
      }
      continue;
    }

    if (changed.length === 0) {
      errors.push({
        message:
          `Resource "${mapping.resourceId}" has octo action "${octoAction.action}", but terraform plans ` +
          `no change on any of [${mapping.terraformAddresses.join(', ')}]!`,
        moduleId: mapping.moduleId,
      });
    } else if (!changed.some((c) => matchesAction(octoAction.action, c.tfActions))) {
      errors.push({
        message:
          `Resource "${mapping.resourceId}" has octo action "${octoAction.action}", but terraform plans ` +
          `${describeChanges(changed)} — none consistent with "${octoAction.action}"!`,
        moduleId: mapping.moduleId,
      });
    }
  }

  // Deleted octo resources are absent from this boot's generated files, so their terraform
  // addresses are unknown from the current sweep. Recover them from the mapping persisted at the
  // last commit (the last-applied state, which still contained them) and verify their deletes.
  let hasUnattributedDelete = false;
  for (const [context, octoAction] of octoActions.entries()) {
    if (octoAction.action !== DiffAction.DELETE) {
      continue;
    }

    const persisted = persistedMappings.get(context);
    if (!persisted) {
      // Never committed through the terraform flow, so its addresses were never recorded.
      warnings.push({
        message:
          `Deleted resource "${octoAction.resourceId}" is not in the persisted terraform mapping ` +
          '(deleted before it was ever committed?); cannot verify its terraform deletes.',
      });
      hasUnattributedDelete = true;
      continue;
    }

    const planChanges = planChangesByModule.get(persisted.moduleId);
    if (!planChanges) {
      // The owning folder was removed entirely (no resources remain); terragrunt destroys it
      // outside any plan octo reads, so there is nothing to verify against.
      warnings.push({
        message:
          `Deleted resource "${octoAction.resourceId}" lived in module "${persisted.moduleId}", whose ` +
          'plan is absent (folder removed); cannot verify its terraform deletes.',
        moduleId: persisted.moduleId,
      });
      continue;
    }

    for (const address of persisted.terraformAddresses) {
      const tfActions = planChanges.get(address) ?? [];
      claim(persisted.moduleId, address);
      if (isNoop(tfActions)) {
        errors.push({
          message:
            `Resource "${octoAction.resourceId}" is deleted in octo, but terraform plans no change ` +
            `on "${address}"!`,
          moduleId: persisted.moduleId,
        });
      } else if (!matchesAction(DiffAction.DELETE, tfActions)) {
        errors.push({
          message:
            `Resource "${octoAction.resourceId}" is deleted in octo, but terraform plans ` +
            `[${tfActions.join(', ')}] on "${address}"!`,
          moduleId: persisted.moduleId,
        });
      }
    }
  }

  // Reverse: every terraform change maps back to an octo diff entry.
  for (const [moduleId, planChanges] of planChangesByModule.entries()) {
    for (const [address, tfActions] of planChanges.entries()) {
      if (claimedAddresses.get(moduleId)?.has(address) || isNoop(tfActions)) {
        continue;
      }

      const joined = [...tfActions].sort().join(',');
      if (joined === 'delete' && hasUnattributedDelete) {
        // An octo delete we could not attribute may own this address; warn instead of failing.
        warnings.push({
          message: `Terraform plans a delete on "${address}" that maps to no attributable octo diff.`,
          moduleId,
        });
      } else {
        errors.push({
          message: `Terraform plans [${tfActions.join(', ')}] on "${address}", which maps to no octo diff!`,
          moduleId,
        });
      }
    }
  }

  return { errors, pass: errors.length === 0, warnings };
}
