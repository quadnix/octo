import type { TerraformFolderOutput, TerraformResourceOutput } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import {
  type AggregatedResourceAction,
  aggregateResourceActions,
} from '../functions/diff/aggregate-resource-actions.js';
import { DiffAction } from '../functions/diff/diff.js';
import { ResourceDataRepository } from '../resources/resource-data.repository.js';
import { TerraformService } from '../services/terraform/terraform.service.js';
import type { ModelTransactionResult } from './apply-transaction.js';

/**
 * One argument terraform plans to change on a resource, with the values on either side.
 *
 * Values are rendered, truncated strings rather than the raw payload: a report is read, not
 * replayed, and the raw payload of a real resource is both enormous and a place secrets live.
 */
export interface ValidateFieldChange {
  field: string;
  /**
   * The current value. Absent on a create. `(sensitive)` when terraform marked it so.
   */
  from?: string;
  /**
   * The planned value. `(known after apply)` when terraform cannot say yet.
   */
  to?: string;
}

/**
 * One terraform address and the actions terraform plans on it (`create`, `update`, `delete`, …).
 */
export interface ValidateTerraformChange {
  address: string;
  /**
   * Which arguments moved, for the changes where that is the whole question: an in-place `update`,
   * and a `create`+`delete` where the point is *which* argument forced the replacement.
   *
   * Left empty on a plain create or delete, where the address and the action already say everything.
   */
  changedFields: ValidateFieldChange[];
  tfActions: string[];
}

/**
 * What `validate` saw, as a report rather than a verdict.
 *
 * Octo's diff and terraform's plan measure different things from different baselines: octo's diff is
 * `desired graph − last committed graph`, terraform's plan is `desired HCL − real cloud state`. The
 * report correlates the two and explains what it can. Only being unable to read a plan makes it
 * unsuccessful — see {@link ValidateReport.failures}.
 */
export interface ValidateReport {
  /**
   * Terraform changes with no octo diff of their own that octo can explain: the resource references
   * something whose identity moved, or the resource no longer renders that address.
   */
  attributedChanges: {
    address: string;
    causeKind: 'address-no-longer-rendered' | 'identity-changed';
    causeResourceId: string;
    moduleId: string;
    tfActions: string[];
  }[];

  /**
   * How far this report can be trusted, decided by whether intent changed.
   *
   * - `exact` — octo's diff is empty. Nothing is mocked and no dependency output moves, so every
   *   folder's plan reflects reality and drift detection is reliable.
   * - `approximate` — octo's diff is non-empty. Each folder is planned alone against the *last
   *   applied* outputs of its dependencies, so a cross-folder consequence of this change is invisible
   *   until apply, and a renamed producer's outputs come from `mock_outputs`. The report may both
   *   understate what apply will do and overstate drift.
   */
  confidence: 'approximate' | 'exact';

  /**
   * Terraform changes nothing in octo explains: the infrastructure moved out from under intent.
   */
  drift: { address: string; moduleId: string; tfActions: string[] }[];

  /**
   * Folders terraform could not plan. The only unsuccessful outcome, because validate cannot report
   * on a folder it was unable to read.
   */
  failures: { message: string; moduleId?: string }[];

  /**
   * Octo resources that changed, each with the terraform changes correlated to it. An empty
   * `terraformChanges` means the intent change carries no infrastructure cost.
   */
  intentChanges: {
    moduleId?: string;
    octoAction: AggregatedResourceAction['action'];
    reason?: string;
    resourceContext: string;
    resourceId: string;
    terraformChanges: ValidateTerraformChange[];
  }[];

  /**
   * Observations that judge nothing: a folder octo does not track, a delete it cannot correlate.
   */
  notes: { message: string; moduleId?: string }[];

  /**
   * Terraform changes planned against a value that may be a `mock_outputs` placeholder. Reported
   * apart from {@link ValidateReport.drift}, and never as drift.
   */
  uncertain: { address: string; moduleId: string; reason: string; tfActions: string[] }[];
}

/**
 * One module's parsed terraform plan, i.e. the JSON produced by `terraform show -json <plan-file>`
 * (run via terragrunt by the caller, so it is backend-agnostic). Only `resource_changes` is read.
 */
export interface TerraformPlan {
  resource_changes?: {
    address: string;
    change?: {
      actions?: string[];
      after?: Record<string, unknown> | null;
      after_sensitive?: Record<string, unknown> | boolean | null;
      after_unknown?: Record<string, unknown> | boolean | null;
      before?: Record<string, unknown> | null;
      before_sensitive?: Record<string, unknown> | boolean | null;
    };
    mode?: string;
  }[];
}

/**
 * One address's plan entry, reduced to what the report needs.
 */
interface PlanChange {
  changedFields: ValidateFieldChange[];
  tfActions: string[];
}

const MAX_RENDERED_VALUE_LENGTH = 80;
const MAX_REPORTED_FIELDS = 12;

/**
 * Renders one terraform value as a short, readable string.
 */
function renderPlanValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '(none)';
  }

  const truncate = (rendered: string): string =>
    rendered.length > MAX_RENDERED_VALUE_LENGTH ? `${rendered.slice(0, MAX_RENDERED_VALUE_LENGTH)}…` : rendered;

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'none';
    }
    // Terraform's list-typed blocks (indexes, rules, listeners) are the ones worth naming: "2 items
    // -> 1 item" does not answer *which* index went away, which is the whole question.
    const names = value
      .map((element) =>
        typeof element === 'object' && element !== null
          ? ((element as Record<string, unknown>).name ?? (element as Record<string, unknown>).index_name)
          : element,
      )
      .filter((name): name is string => typeof name === 'string' && name.length > 0);

    return names.length === value.length ? truncate(names.join(', ')) : `${value.length} item(s)`;
  }

  return truncate(typeof value === 'string' ? value : JSON.stringify(value));
}

/**
 * True when any leaf of a terraform sensitive/unknown mark is `true`.
 *
 * These maps mirror the *shape* of the value they describe, so a list of five blocks with nothing
 * sensitive in it is `[{}, {}, {}, {}, {}]` — structure, not a signal. Only a literal `true`
 * anywhere in that structure marks something, which is why "non-empty object" is the wrong test: it
 * reported every list-typed argument on a DynamoDB table as sensitive.
 */
function hasMark(mark: unknown): boolean {
  if (mark === true) {
    return true;
  }
  if (typeof mark !== 'object' || mark === null) {
    return false;
  }
  return Object.values(mark as Record<string, unknown>).some(hasMark);
}

/**
 * True when terraform's sensitive/unknown map marks `key`.
 */
function isMarked(marks: Record<string, unknown> | boolean | null | undefined, key: string): boolean {
  if (marks === true) {
    return true;
  }
  if (!marks || typeof marks !== 'object') {
    return false;
  }
  return hasMark((marks as Record<string, unknown>)[key]);
}

/**
 * The arguments that differ between `before` and `after`.
 *
 * Terraform already hands us both sides — `readPlan` parses the whole `show -json` payload — so this
 * costs nothing but the comparison. Without it an added index and a removed index render as the
 * same sentence: "1 update".
 */
function describeFieldChanges(
  change: NonNullable<NonNullable<TerraformPlan['resource_changes']>[number]['change']>,
): ValidateFieldChange[] {
  const actions = new Set(change.actions ?? []);
  // A plain create or delete needs no field list: the address and the action are the whole story.
  const isUpdate = actions.has('update');
  const isReplace = actions.has('create') && actions.has('delete');
  if (!isUpdate && !isReplace) {
    return [];
  }

  const before = (change.before ?? {}) as Record<string, unknown>;
  const after = (change.after ?? {}) as Record<string, unknown>;
  const fields: ValidateFieldChange[] = [];

  for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const unknownAfter = isMarked(change.after_unknown, key);
    if (!unknownAfter && JSON.stringify(before[key]) === JSON.stringify(after[key])) {
      continue;
    }

    fields.push({
      field: key,
      from: isMarked(change.before_sensitive, key) ? '(sensitive)' : renderPlanValue(before[key]),
      to: unknownAfter
        ? '(known after apply)'
        : isMarked(change.after_sensitive, key)
          ? '(sensitive)'
          : renderPlanValue(after[key]),
    });

    if (fields.length === MAX_REPORTED_FIELDS) {
      break;
    }
  }

  return fields;
}

/**
 * Read-only correlation of `terraform plan` against intent. Never writes state or folders.
 *
 * `plans` maps each module folder's id to its parsed terraform plan, and `planErrors` maps a folder
 * terraform *failed* to plan to the reason why. The two are disjoint, and a folder in neither was
 * never inspected.
 *
 * `persistedMappings` is the octo→terraform mapping captured by the last commit. It supplies the
 * addresses of resources deleted since (absent from this boot's generated files), and identifies
 * producers that have never been applied, whose outputs terragrunt can only supply as a mock.
 *
 * Plans are partitioned by the tracked set (intent ∪ the committed folder record,
 * `previousFolders`): a plan for a module the sweep filled is demanded and correlated; a plan for a
 * committed-then-deleted (emptied) folder is read when supplied; a plan for a folder octo does
 * **not** track is noted and excluded from all correlation, and re-declaring its module in intent
 * re-adopts it.
 *
 * `externalResourceStateIds` names every external resource a `run-action` published and no commit
 * has recorded yet, from `StateManagementService.listExternalResourceStateIds()`. Each one is
 * reported as a note.
 *
 * By-design limit: correlation is resource-level, not field-level.
 *
 * @internal
 */
export async function validate({
  externalResourceStateIds = [],
  persistedMappings,
  planErrors = new Map(),
  plans,
  previousFolders = [],
  transaction,
}: {
  externalResourceStateIds?: string[];
  persistedMappings: Map<string, TerraformResourceOutput>;
  planErrors?: Map<string, string>;
  plans: Map<string, TerraformPlan>;
  previousFolders?: TerraformFolderOutput[];
  transaction: ModelTransactionResult;
}): Promise<ValidateReport> {
  const container = Container.getInstance();
  const [resourceDataRepository, terraformService] = await Promise.all([
    container.get(ResourceDataRepository),
    container.get(TerraformService),
  ]);

  const allDiffs = transaction.resourceDiffs.flat();
  const mappings = terraformService.getOctoTerraformResourceMappings();

  const report: ValidateReport = {
    attributedChanges: [],
    confidence: allDiffs.length === 0 ? 'exact' : 'approximate',
    drift: [],
    failures: [],
    intentChanges: [],
    notes: [],
    uncertain: [],
  };

  // Report what an external resource published and no commit has recorded. Octo reaches that record
  // only by the resource id terraform asks for, so one whose resource has left both graphs is
  // published infrastructure nothing will ever ask about again - the only place a user can be told
  // is here.
  if (externalResourceStateIds.length > 0) {
    const heldResourceIds = new Set(
      [
        ...resourceDataRepository.getNewResourcesByProperties(),
        ...resourceDataRepository.getActualResourcesByProperties(),
      ].map((resource) => resource.resourceId),
    );

    for (const resourceId of [...externalResourceStateIds].sort()) {
      report.notes.push({
        message: heldResourceIds.has(resourceId)
          ? `External resource "${resourceId}" is published but not recorded in octo state; the next successful ` +
            'commit records it.'
          : `External resource "${resourceId}" is published but not recorded in octo state, and neither intent nor ` +
            'the committed graph declares it any more, so octo will never delete it.',
      });
    }
  }

  // Aggregate octo diffs to one action per resource.
  const octoActions = aggregateResourceActions(allDiffs);

  const parsePlanChanges = (plan: TerraformPlan): Map<string, PlanChange> => {
    const changes = new Map<string, PlanChange>();

    for (const resourceChange of plan.resource_changes ?? []) {
      if (resourceChange.mode === 'data') {
        continue;
      }
      changes.set(resourceChange.address, {
        changedFields: resourceChange.change ? describeFieldChanges(resourceChange.change) : [],
        tfActions: resourceChange.change?.actions ?? [],
      });
    }

    return changes;
  };

  const sweptModuleIds = new Set(terraformService.getModuleIds());
  const trackedModuleIds = new Set([...sweptModuleIds, ...previousFolders.map((folder) => folder.moduleId)]);
  const planChangesByModule = new Map<string, Map<string, PlanChange>>();
  const NO_PLAN_CHANGE: PlanChange = { changedFields: [], tfActions: [] };

  // Every module the sweep filled must have a plan. `getModuleIds()` only lists modules that
  // contributed a resource, so a missing plan means terraform ran on a real folder and failed.
  for (const moduleId of sweptModuleIds) {
    const plan = plans.get(moduleId);
    if (!plan) {
      const cause = planErrors.get(moduleId);
      report.failures.push({
        message: cause
          ? `Terraform failed to plan module "${moduleId}":\n${cause}`
          : `No terraform plan was supplied for module "${moduleId}", so octo cannot report on it.`,
        moduleId,
      });
      continue;
    }

    planChangesByModule.set(moduleId, parsePlanChanges(plan));
  }

  // Remaining plans belong either to an emptied folder octo still tracks, or to a folder it does not
  // own at all.
  for (const [moduleId, plan] of plans.entries()) {
    if (sweptModuleIds.has(moduleId)) {
      continue;
    }

    if (trackedModuleIds.has(moduleId)) {
      planChangesByModule.set(moduleId, parsePlanChanges(plan));
    } else {
      report.notes.push({
        message:
          `Terraform plan supplied for folder "${moduleId}", which octo does not track (not in intent or committed ` +
          'state); excluding it from this report. Re-declare its module in intent to re-adopt it.',
        moduleId,
      });
    }
  }

  const isNoop = (actions: string[]): boolean =>
    actions.length === 0 || (actions.length === 1 && (actions[0] === 'no-op' || actions[0] === 'read'));

  const claimedAddresses = new Map<string, Set<string>>();
  const claim = (moduleId: string, address: string): void => {
    if (!claimedAddresses.has(moduleId)) {
      claimedAddresses.set(moduleId, new Set());
    }
    claimedAddresses.get(moduleId)!.add(address);
  };

  const referrers = terraformService.getResourceReferrers();
  const mappingByResourceId = new Map(mappings.map((mapping) => [mapping.resourceId, mapping]));

  // Terraform changes everything that transitively references a resource whose identity moved, while
  // octo's diff carries only the moved resource itself. Walking the same reference graph terraform
  // cascades along recovers the rest.
  //
  // An identity moves on REPLACE (force-new recreates the referrer too), and on ADD or DELETE of a
  // resourceId — a referrer that kept its own id then renders a different terraform address. Renaming
  // an execution, for instance, replaces `alb-target-group-<old>` with `alb-target-group-<new>`, and
  // the untouched alb-listener's `default_action.forward.target_group.arn` moves with it.
  const identityChangedResourceIds = new Set(
    [...octoActions.values()]
      .filter((a) => a.action === DiffAction.REPLACE || a.action === DiffAction.ADD || a.action === DiffAction.DELETE)
      .map((a) => a.resourceId),
  );

  // Each affected referrer maps to the moved resource it references, so the report can name the cause.
  const cascadeCauseByResourceId = new Map<string, string>();
  const cascadeQueue = [...identityChangedResourceIds];

  while (cascadeQueue.length > 0) {
    const referentId = cascadeQueue.shift()!;

    for (const referrerId of referrers.get(referentId) ?? []) {
      if (!cascadeCauseByResourceId.has(referrerId) && !identityChangedResourceIds.has(referrerId)) {
        cascadeCauseByResourceId.set(referrerId, referentId);
        cascadeQueue.push(referrerId);
      }
    }
  }

  // Resources that may have been planned against a `mock_outputs` placeholder rather than a real
  // value. Terragrunt substitutes a mock when a producer folder's state lacks the requested output
  // name, and since that name embeds the producer's resourceId, the case is exactly a producer absent
  // from the last commit's mapping. Same-module references use no dependency block and cannot be
  // mocked.
  //
  // Known gap: a producer that survives but gains a new response key has a new output name that is
  // also absent from state, which nothing here detects.
  const mockFedCauseByResourceId = new Map<string, string>();
  const mockQueue: string[] = [];
  const markMockFed = (resourceId: string, cause: string): void => {
    if (!mockFedCauseByResourceId.has(resourceId)) {
      mockFedCauseByResourceId.set(resourceId, cause);
      mockQueue.push(resourceId);
    }
  };

  for (const [referentId, referrerIds] of referrers.entries()) {
    const referent = mappingByResourceId.get(referentId);
    if (!referent || persistedMappings.has(referent.resourceContext)) {
      continue;
    }

    for (const referrerId of referrerIds) {
      const referrer = mappingByResourceId.get(referrerId);
      if (referrer && referrer.moduleId !== referent.moduleId) {
        markMockFed(referrerId, referentId);
      }
    }
  }

  // A mocked value propagates: anything reading it is planned on it too.
  while (mockQueue.length > 0) {
    const resourceId = mockQueue.shift()!;
    const cause = mockFedCauseByResourceId.get(resourceId)!;

    for (const referrerId of referrers.get(resourceId) ?? []) {
      markMockFed(referrerId, cause);
    }
  }

  const mockFedModuleIds = new Set(
    [...mockFedCauseByResourceId.keys()]
      .map((resourceId) => mappingByResourceId.get(resourceId)?.moduleId)
      .filter((moduleId): moduleId is string => moduleId !== undefined),
  );

  const describeMockCause = (cause: string): string =>
    `planned against a "mock_outputs" placeholder: it consumes an output of "${cause}", which has never been ` +
    'applied, so the value terraform compared against is not the value it will get';

  /**
   * Classifies a terraform change on a resource octo did not flag: attributed if octo explains it,
   * uncertain if the plan itself may be wrong, drift otherwise.
   */
  const classifyChangeWithNoOctoDiff = (
    moduleId: string,
    resourceId: string,
    change: ValidateTerraformChange,
  ): void => {
    const cascadeCause = cascadeCauseByResourceId.get(resourceId);
    if (cascadeCause) {
      report.attributedChanges.push({
        address: change.address,
        causeKind: 'identity-changed',
        causeResourceId: cascadeCause,
        moduleId,
        tfActions: change.tfActions,
      });
      return;
    }

    const mockCause = mockFedCauseByResourceId.get(resourceId);
    if (mockCause) {
      report.uncertain.push({
        address: change.address,
        moduleId,
        reason: describeMockCause(mockCause),
        tfActions: change.tfActions,
      });
      return;
    }

    report.drift.push({ address: change.address, moduleId, tfActions: change.tfActions });
  };

  // Forward: correlate every address this sweep rendered with the plan.
  for (const mapping of mappings) {
    const octoAction = octoActions.get(mapping.resourceContext);

    // The folder failed to plan and is already a `failure`. Reporting an empty terraform side here
    // would read as "no infrastructure change" for a folder nobody could read.
    const planChanges = planChangesByModule.get(mapping.moduleId);
    if (!planChanges) {
      continue;
    }

    const addressActions = mapping.terraformAddresses.map((address) => {
      claim(mapping.moduleId, address);
      const planChange = planChanges.get(address) ?? NO_PLAN_CHANGE;
      return { address, changedFields: planChange.changedFields, tfActions: planChange.tfActions };
    });

    // A resource can render a variable number of addresses — one rule resource per security group
    // rule, one object per s3 website file. When it survives but renders fewer, the dropped address
    // is in no current mapping, so its destroy belongs to the resource that stopped rendering it.
    const persisted = persistedMappings.get(mapping.resourceContext);
    const currentAddresses = new Set(mapping.terraformAddresses);

    for (const address of persisted?.terraformAddresses ?? []) {
      if (currentAddresses.has(address)) {
        continue;
      }

      claim(mapping.moduleId, address);

      const { tfActions } = planChanges.get(address) ?? NO_PLAN_CHANGE;
      if (!isNoop(tfActions)) {
        report.attributedChanges.push({
          address,
          causeKind: 'address-no-longer-rendered',
          causeResourceId: mapping.resourceId,
          moduleId: mapping.moduleId,
          tfActions,
        });
      }
    }

    const changed = addressActions.filter((a) => !isNoop(a.tfActions));

    // Record what octo said and what terraform said, without requiring the two to agree.
    if (octoAction) {
      report.intentChanges.push({
        moduleId: mapping.moduleId,
        octoAction: octoAction.action,
        reason: octoAction.reason,
        resourceContext: mapping.resourceContext,
        resourceId: mapping.resourceId,
        terraformChanges: changed,
      });
      continue;
    }

    for (const change of changed) {
      classifyChangeWithNoOctoDiff(mapping.moduleId, mapping.resourceId, change);
    }
  }

  // Deleted octo resources are absent from this boot's generated files, so their addresses come from
  // the mapping persisted at the last commit.
  let hasUnverifiableDelete = false;

  for (const [context, octoAction] of octoActions.entries()) {
    if (octoAction.action !== DiffAction.DELETE) {
      continue;
    }

    // Never committed through the terraform flow, so its addresses were never recorded.
    const persisted = persistedMappings.get(context);
    if (!persisted) {
      report.notes.push({
        message:
          `Deleted resource "${octoAction.resourceId}" is not in the persisted terraform mapping ` +
          '(deleted before it was ever committed?); its terraform addresses are unknown.',
      });
      report.intentChanges.push({
        octoAction: DiffAction.DELETE,
        reason: octoAction.reason,
        resourceContext: context,
        resourceId: octoAction.resourceId,
        terraformChanges: [],
      });

      hasUnverifiableDelete = true;
      continue;
    }

    // The owning folder is emptied and no plan was supplied for it, so its destroys cannot be
    // correlated.
    const planChanges = planChangesByModule.get(persisted.moduleId);
    if (!planChanges) {
      report.notes.push({
        message:
          `Deleted resource "${octoAction.resourceId}" lived in module "${persisted.moduleId}", whose ` +
          'plan was not supplied; its terraform deletes are not in this report.',
        moduleId: persisted.moduleId,
      });
      report.intentChanges.push({
        moduleId: persisted.moduleId,
        octoAction: DiffAction.DELETE,
        reason: octoAction.reason,
        resourceContext: context,
        resourceId: octoAction.resourceId,
        terraformChanges: [],
      });
      continue;
    }

    const terraformChanges: ValidateTerraformChange[] = [];

    for (const address of persisted.terraformAddresses) {
      const { changedFields, tfActions } = planChanges.get(address) ?? NO_PLAN_CHANGE;
      claim(persisted.moduleId, address);

      if (!isNoop(tfActions)) {
        terraformChanges.push({ address, changedFields, tfActions });
      }
    }

    // No terraform change means the resource is already gone from the cloud and intent has caught up.
    report.intentChanges.push({
      moduleId: persisted.moduleId,
      octoAction: DiffAction.DELETE,
      reason: octoAction.reason,
      resourceContext: context,
      resourceId: octoAction.resourceId,
      terraformChanges,
    });
  }

  // Reverse: whatever terraform plans that no octo resource has claimed.
  for (const [moduleId, planChanges] of planChangesByModule.entries()) {
    for (const [address, { tfActions }] of planChanges.entries()) {
      if (claimedAddresses.get(moduleId)?.has(address) || isNoop(tfActions)) {
        continue;
      }

      const joined = [...tfActions].sort().join(',');

      if (joined === 'delete' && hasUnverifiableDelete) {
        report.notes.push({
          message:
            `Terraform plans a delete on "${address}", which is unclaimed — an octo delete with no persisted ` +
            'mapping may own it.',
          moduleId,
        });
      } else if (mockFedModuleIds.has(moduleId)) {
        report.uncertain.push({
          address,
          moduleId,
          reason:
            'no octo resource renders this address, and this folder was planned with at least one ' +
            '"mock_outputs" placeholder substituted',
          tfActions,
        });
      } else {
        report.drift.push({ address, moduleId, tfActions });
      }
    }
  }

  return report;
}
