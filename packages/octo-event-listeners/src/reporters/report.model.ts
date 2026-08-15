import type {
  CommitModeCompletedEvent,
  DiffMetadata,
  ModeStartedEvent,
  ValidateModeCompletedEvent,
} from '@quadnix/octo';

/**
 * What the listener collected from octo's events during one mode.
 */
export interface RunObservation {
  appName?: string;
  commit?: CommitModeCompletedEvent['payload'];
  durationInMs?: number;
  error?: string;
  mode: ModeStartedEvent['payload']['mode'];
  modelTransaction: DiffMetadata[][];
  startedAt: number;
  /**
   * Time spent in terraform since the last report, which the mode's own duration does not cover.
   * See {@link OctoReport.terraformInMs}.
   */
  terraformInMs?: number;
  validate?: ValidateModeCompletedEvent['payload']['report'];
}

/**
 * What can happen to an octo resource or a terraform address. `recreate` is create + delete.
 */
export type ChangeKind = 'create' | 'delete' | 'other' | 'recreate' | 'update';

export const CHANGE_SYMBOLS: Record<ChangeKind, string> = {
  create: '+',
  delete: '-',
  other: '?',
  recreate: '±',
  update: '~',
};

export const CHANGE_VERBS: Record<ChangeKind, string> = {
  create: 'added',
  delete: 'removed',
  other: 'changed',
  recreate: 'replaced',
  update: 'changed',
};

/**
 * One terraform address under a resource.
 */
export interface ReportAddress {
  address: string;
  /**
   * Which arguments moved. Empty on a plain create or delete, where the action says it all.
   */
  changedFields: { field: string; from?: string; to?: string }[];
  explanation?: string;
  kind: ChangeKind;
}

/**
 * One octo resource that changed, and the terraform addresses it renders.
 */
export interface ReportResource {
  kind: ChangeKind;
  reason?: string;
  resourceContext: string;
  resourceId: string;
  terraform: ReportAddress[];
}

/**
 * One card: something the user changed, and the resources that changed because of it.
 */
export interface ReportStory {
  id: string;
  /**
   * True when no intent change explained these resources, so they were grouped by module instead.
   */
  isDerived: boolean;
  kind: ChangeKind;
  moduleId?: string;
  nodeContext?: string;
  reason?: string;
  resources: ReportResource[];
  /**
   * True when octo wants to change these resources but terraform's plan plans nothing on any of
   * their addresses. The two disagree, and saying so is the honest reading — rendering the card
   * title from octo and "no infrastructure change" from terraform, with every counter at zero,
   * reads as both "this rebuilds 8 modules" and "nothing will happen".
   *
   * Usually means the change is invisible to a plan taken against the current state (a provider or
   * account move), which is exactly what `confidence: approximate` warns about.
   */
  terraformPlannedNothing: boolean;
  title: string;
  /**
   * Terraform changes under this story.
   */
  totals: Record<ChangeKind, number>;
}

/**
 * A terraform change no intent change explains.
 */
export interface ReportUnexplained {
  address: string;
  kind: ChangeKind;
  moduleId: string;
  /**
   * Set on uncertain changes only. Why the change could not be judged.
   */
  reason?: string;
}

/**
 * One octo run, as a human reads it. Built by {@link buildReport}.
 */
export interface OctoReport {
  app: string;
  commit?: RunObservation['commit'];
  confidence?: 'approximate' | 'exact';
  /**
   * Terraform changes nothing in intent explains.
   */
  drift: ReportUnexplained[];
  durationInMs: number;
  failures: { message: string; moduleId?: string }[];
  finishedAt: number;
  /**
   * A generated one-sentence summary, for the top of the page.
   */
  headline: string;
  mode: 'commit' | 'validate';
  notes: { message: string; moduleId?: string }[];
  outcome: 'changes' | 'clean' | 'drift' | 'failed';
  startedAt: number;
  stories: ReportStory[];
  /**
   * Time spent in terraform since the last report — the plan a validate reads, the apply and the
   * output reads a commit follows.
   *
   * Reported apart from `durationInMs` because terraform runs *outside* the mode: both the CLI and
   * `runModules` plan first and hand the result to `octo.validate()`, so the mode measures only the
   * correlating. A validate that sat through 253 s of planning reported "finished in 2ms".
   */
  terraformInMs: number;
  totals: Record<ChangeKind, number>;
  /**
   * Changes planned against a possibly-mocked value, so not judged as drift.
   */
  uncertain: ReportUnexplained[];
}

export function emptyTotals(): Record<ChangeKind, number> {
  return { create: 0, delete: 0, other: 0, recreate: 0, update: 0 };
}

/**
 * Collapses terraform's action list to a {@link ChangeKind}.
 */
export function classifyTerraformActions(tfActions: string[]): ChangeKind {
  switch ([...tfActions].sort().join(',')) {
    case 'create':
      return 'create';
    case 'create,delete':
    case 'delete,create':
      return 'recreate';
    case 'delete':
      return 'delete';
    case 'update':
      return 'update';
    default:
      return 'other';
  }
}

/**
 * Collapses an octo action to a {@link ChangeKind}.
 */
export function classifyOctoAction(action: string): ChangeKind {
  switch (action) {
    case 'add':
      return 'create';
    case 'delete':
      return 'delete';
    case 'replace':
      return 'recreate';
    default:
      return 'update';
  }
}
