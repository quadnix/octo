import { type ActionOutputs, DiffAction } from '@quadnix/octo';
import {
  CHANGE_VERBS,
  type ChangeKind,
  type OctoReport,
  type ReportAddress,
  type ReportResource,
  type ReportStory,
  type ReportUnexplained,
  type RunObservation,
  classifyOctoAction,
  classifyTerraformActions,
  emptyTotals,
} from './report.model.js';

/**
 * Model diff fields that are bookkeeping, not intent. A move already shows up as the thing moved.
 */
const NOISE_FIELDS = new Set(['parent']);

/**
 * An intent change, before it becomes a story.
 */
interface IntentChange {
  action: string;
  causedResourceContexts: string[];
  id: string;
  nodeContext: string;
  reason?: string;
}

/**
 * `execution=backend,server=api,app=my-app` -> `execution=backend`.
 */
function leafOfContext(context: string): string {
  const [first] = context.split(',');
  return first ?? context;
}

/**
 * What the user edited, from the model transaction.
 * `DiffMetadata.outputs` holds the resources each model action produced, which links the two.
 */
function readIntentChanges(observation: RunObservation): IntentChange[] {
  const intentChanges: IntentChange[] = [];
  let index = 0;

  for (const diff of observation.modelTransaction.flat()) {
    // VALIDATE diffs are an assertion pass, not a user change.
    if (diff.action === DiffAction.VALIDATE) {
      continue;
    }
    if (NOISE_FIELDS.has(diff.field) && diff.action === DiffAction.UPDATE) {
      continue;
    }

    const causedResourceContexts = Object.values(diff.outputs as ActionOutputs)
      .filter((resource) => resource !== undefined)
      .map((resource) => resource.getContext());

    intentChanges.push({
      action: diff.action,
      causedResourceContexts: [...new Set(causedResourceContexts)],
      id: `intent-${index++}`,
      nodeContext: diff.node.getContext(),
      reason: diff.diff.reason,
    });
  }

  return intentChanges;
}

/**
 * The octo resources that changed, with the terraform addresses they render.
 */
function readResources(
  observation: RunObservation,
): Map<string, { addresses: string[]; moduleId: string; resource: ReportResource }> {
  // Both modes describe resources identically; only validate has terraform's plan, which is where
  // the addresses come from. Commit has no plan, so it carries the addresses it applied.
  const changed = observation.validate
    ? observation.validate.intentChanges.map((change) => ({
        action: change.octoAction,
        moduleId: change.moduleId,
        reason: change.reason,
        resourceContext: change.resourceContext,
        resourceId: change.resourceId,
        terraformAddresses: change.terraformChanges.map((terraform) => terraform.address),
      }))
    : (observation.commit?.resources ?? []);

  const resources = new Map<string, { addresses: string[]; moduleId: string; resource: ReportResource }>();

  for (const entry of changed) {
    resources.set(entry.resourceContext, {
      addresses: entry.terraformAddresses,
      moduleId: entry.moduleId ?? '(unknown module)',
      resource: {
        kind: classifyOctoAction(entry.action),
        reason: entry.reason,
        resourceContext: entry.resourceContext,
        resourceId: entry.resourceId,
        terraform: [],
      },
    });
  }

  return resources;
}

/**
 * Attaches each terraform change to the resource responsible for it.
 * In commit mode there is no plan, so the resource's own action is used instead.
 */
function attachTerraformChanges(
  observation: RunObservation,
  resources: Map<string, { addresses: string[]; moduleId: string; resource: ReportResource }>,
): { drift: ReportUnexplained[]; totals: Record<ChangeKind, number>; uncertain: ReportUnexplained[] } {
  const drift: ReportUnexplained[] = [];
  const uncertain: ReportUnexplained[] = [];
  const totals = emptyTotals();

  const byResourceId = new Map(
    [...resources.values()].map((entry) => [entry.resource.resourceId, entry.resource.resourceContext]),
  );

  const attach = (resourceContext: string, row: ReportAddress): void => {
    resources.get(resourceContext)?.resource.terraform.push(row);
    totals[row.kind]++;
  };

  if (observation.validate) {
    for (const intentChange of observation.validate.intentChanges) {
      for (const change of intentChange.terraformChanges) {
        attach(intentChange.resourceContext, {
          address: change.address,
          changedFields: change.changedFields ?? [],
          kind: classifyTerraformActions(change.tfActions),
          ...(change.omittedFieldCount ? { omittedFieldCount: change.omittedFieldCount } : {}),
        });
      }
    }

    // Attach to the resource that caused it, so it reads under the thing the user changed.
    for (const attributed of observation.validate.attributedChanges) {
      const kind = classifyTerraformActions(attributed.tfActions);
      const causeContext = byResourceId.get(attributed.causeResourceId);
      // Worded from the action terraform actually plans: an identity cascade updates a referrer as
      // often as it recreates one, and claiming "recreated" next to a `~` contradicts the symbol.
      const consequence = kind === 'recreate' ? 'recreated' : kind === 'delete' ? 'destroyed' : 'changed';
      const explanation =
        attributed.causeKind === 'identity-changed'
          ? `references "${attributed.causeResourceId}", whose identity changed, so this is ${consequence} with it`
          : `"${attributed.causeResourceId}" no longer renders this address`;

      if (causeContext) {
        attach(causeContext, { address: attributed.address, changedFields: [], explanation, kind });
      } else {
        drift.push({ address: attributed.address, kind, moduleId: attributed.moduleId });
      }
    }

    // Drift and uncertain are deliberately kept out of `totals`. `totals` answers "what does my
    // change do", and it is what the headline counts; a change nobody made must not be attributed
    // to the user. Both get their own counters on the page.
    for (const change of observation.validate.uncertain) {
      uncertain.push({
        address: change.address,
        kind: classifyTerraformActions(change.tfActions),
        moduleId: change.moduleId,
        reason: change.reason,
      });
    }

    for (const change of observation.validate.drift) {
      drift.push({
        address: change.address,
        kind: classifyTerraformActions(change.tfActions),
        moduleId: change.moduleId,
      });
    }

    return { drift, totals, uncertain };
  }

  for (const entry of resources.values()) {
    for (const address of entry.addresses) {
      attach(entry.resource.resourceContext, { address, changedFields: [], kind: entry.resource.kind });
    }
  }

  return { drift, totals, uncertain };
}

/**
 * Groups resources under the intent change that caused them, one card each.
 *
 * A resource touched by several model actions is shown once, under its most consequential one
 * (add/delete/replace beats update); earliest wins on a tie.
 */
function buildStories(
  intentChanges: IntentChange[],
  resources: Map<string, { addresses: string[]; moduleId: string; resource: ReportResource }>,
): ReportStory[] {
  const ownerByResourceContext = new Map<string, string>();
  const intentById = new Map(intentChanges.map((intentChange) => [intentChange.id, intentChange]));
  const isStrong = (action: string): boolean => action !== 'update';

  for (const intentChange of intentChanges) {
    for (const resourceContext of intentChange.causedResourceContexts) {
      const currentOwnerId = ownerByResourceContext.get(resourceContext);
      if (currentOwnerId === undefined) {
        ownerByResourceContext.set(resourceContext, intentChange.id);
        continue;
      }
      const currentOwner = intentById.get(currentOwnerId);
      if (currentOwner && !isStrong(currentOwner.action) && isStrong(intentChange.action)) {
        ownerByResourceContext.set(resourceContext, intentChange.id);
      }
    }
  }

  // Label only when every resource under it agrees.
  const moduleOf = (rows: ReportResource[]): string | undefined => {
    const moduleIds = new Set(
      rows.map((row) => resources.get(row.resourceContext)?.moduleId).filter((id): id is string => id !== undefined),
    );
    return moduleIds.size === 1 ? [...moduleIds][0] : undefined;
  };

  const totalsOf = (rows: ReportResource[]): Record<ChangeKind, number> => {
    const totals = emptyTotals();
    for (const row of rows) {
      for (const address of row.terraform) {
        totals[address.kind]++;
      }
    }
    return totals;
  };

  // Octo wants these changed; terraform's plan touches none of their addresses.
  const plannedNothing = (rows: ReportResource[]): boolean =>
    rows.length > 0 && rows.every((row) => row.terraform.length === 0);

  const claimed = new Set<string>();
  const stories: ReportStory[] = [];

  for (const intentChange of intentChanges) {
    const rows = intentChange.causedResourceContexts
      .filter((context) => ownerByResourceContext.get(context) === intentChange.id)
      .map((context) => resources.get(context)?.resource)
      .filter((resource): resource is ReportResource => resource !== undefined);

    // The model action ran, but nothing downstream of it changed.
    if (rows.length === 0) {
      continue;
    }

    for (const row of rows) {
      claimed.add(row.resourceContext);
    }

    const kind = classifyOctoAction(intentChange.action);
    stories.push({
      id: intentChange.id,
      isDerived: false,
      kind,
      moduleId: moduleOf(rows),
      nodeContext: intentChange.nodeContext,
      reason: intentChange.reason,
      resources: rows,
      terraformPlannedNothing: plannedNothing(rows),
      title: `${CHANGE_VERBS[kind]} ${leafOfContext(intentChange.nodeContext)}`,
      totals: totalsOf(rows),
    });
  }

  // Resources no intent change claimed must still appear. Usual case: a module removed from intent,
  // whose models are gone, so no model diff remains to hang them off.
  const orphansByModule = new Map<string, ReportResource[]>();
  for (const entry of resources.values()) {
    if (claimed.has(entry.resource.resourceContext)) {
      continue;
    }
    if (!orphansByModule.has(entry.moduleId)) {
      orphansByModule.set(entry.moduleId, []);
    }
    orphansByModule.get(entry.moduleId)!.push(entry.resource);
  }

  for (const [moduleId, rows] of orphansByModule.entries()) {
    // Name the card after the shared action, e.g. "removed s3-website-service-module".
    const kinds = new Set(rows.map((row) => row.kind));
    const kind: ChangeKind = kinds.size === 1 ? [...kinds][0] : 'update';

    stories.push({
      id: `intent-module-${moduleId}`,
      isDerived: true,
      kind,
      moduleId,
      resources: rows,
      terraformPlannedNothing: plannedNothing(rows),
      title: kinds.size === 1 ? `${CHANGE_VERBS[kind]} ${moduleId}` : `changed ${moduleId}`,
      totals: totalsOf(rows),
    });
  }

  // Destroys first: they are the only irreversible ones.
  const weight = (story: ReportStory): number =>
    story.totals.delete * 1000 + story.totals.recreate * 100 + story.totals.create * 10 + story.totals.update;
  stories.sort((a, b) => {
    if (a.isDerived !== b.isDerived) {
      return a.isDerived ? 1 : -1;
    }
    return weight(b) - weight(a);
  });

  return stories;
}

/**
 * The generated sentence at the top of the page.
 */
function buildHeadline(report: Omit<OctoReport, 'headline'>): string {
  if (report.failures.length > 0) {
    return `Terraform could not plan ${report.failures.length} folder(s), so this report is incomplete.`;
  }

  const past = report.mode === 'commit';
  const { totals } = report;
  const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

  // Drift leads whenever it exists. It is the only finding nobody asked for, and it produces no
  // stories by definition: intent did not change, which is what makes it drift.
  const drifted =
    report.drift.length > 0
      ? `${plural(report.drift.length, 'change')} to your infrastructure ` +
        `${report.drift.length === 1 ? 'is' : 'are'} not explained by anything in your intent — start there.`
      : '';

  if (report.stories.length === 0) {
    if (drifted) {
      return drifted;
    }
    return past
      ? 'Nothing changed. Octo state already matched your infrastructure.'
      : 'Your intent and your infrastructure already agree. Nothing to do.';
  }

  const [biggest] = report.stories;
  const others =
    report.stories.length > 1
      ? ` (+${report.stories.length - 1} other change${report.stories.length > 2 ? 's' : ''})`
      : '';

  // Destroys first because they are irreversible, then creates, then updates — but never silently:
  // an update-only change used to produce a bare "You changed X." with no number at all.
  const destroyed = totals.delete + totals.recreate;
  const consequence =
    destroyed > 0
      ? ` ${past ? 'That destroyed or replaced' : 'That destroys or replaces'} ` +
        `${plural(destroyed, 'thing')} — check those before anything else.`
      : totals.create > 0
        ? ` ${past ? 'That created' : 'That creates'} ${plural(totals.create, 'new thing')}.`
        : totals.update > 0
          ? ` ${past ? 'That updated' : 'That updates'} ${plural(totals.update, 'thing')} in place.`
          : ` ${past ? 'Terraform reported no infrastructure change' : 'Terraform plans no infrastructure change'}` +
            ` for it — see each card for why.`;

  return `You ${biggest.title}${others}.${consequence}${drifted ? ` Separately, ${drifted}` : ''}`;
}

/**
 * Turns what the listener observed into the report a human reads.
 */
export function buildReport(observation: RunObservation): OctoReport {
  const mode = observation.mode === 'commit' ? 'commit' : 'validate';
  const finishedAt = observation.startedAt + (observation.durationInMs ?? 0);

  const intentChanges = readIntentChanges(observation);
  const resources = readResources(observation);
  const { drift, totals, uncertain } = attachTerraformChanges(observation, resources);
  const stories = buildStories(intentChanges, resources);

  const failures = [...(observation.validate?.failures ?? [])];
  if (observation.error) {
    failures.unshift({ message: observation.error });
  }

  const report: Omit<OctoReport, 'headline'> = {
    app: observation.appName ?? '(unknown app)',
    commit: observation.commit,
    confidence: observation.validate?.confidence,
    dataLoss: observation.validate?.dataLoss ?? [],
    drift,
    durationInMs: observation.durationInMs ?? 0,
    failures,
    finishedAt,
    mode,
    moves: observation.validate?.moves ?? [],
    notes: observation.validate?.notes ?? [],
    outcome: failures.length > 0 ? 'failed' : drift.length > 0 ? 'drift' : stories.length > 0 ? 'changes' : 'clean',
    startedAt: observation.startedAt,
    stories,
    terraformInMs: observation.terraformInMs ?? 0,
    totals,
    uncertain,
  };

  // Rebuilt in key order rather than spread-with-headline-appended: the report is written to disk as
  // JSON, and appending left `headline` last in every file on disk.
  return {
    app: report.app,
    commit: report.commit,
    confidence: report.confidence,
    dataLoss: report.dataLoss,
    drift: report.drift,
    durationInMs: report.durationInMs,
    failures: report.failures,
    finishedAt: report.finishedAt,
    headline: buildHeadline(report),
    mode: report.mode,
    moves: report.moves,
    notes: report.notes,
    outcome: report.outcome,
    startedAt: report.startedAt,
    stories: report.stories,
    terraformInMs: report.terraformInMs,
    totals: report.totals,
    uncertain: report.uncertain,
  };
}
