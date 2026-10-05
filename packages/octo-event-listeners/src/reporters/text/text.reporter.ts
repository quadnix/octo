import { TimestampUtility } from '../../utilities/timestamp/timestamp.utility.js';
import {
  CHANGE_LABELS,
  CHANGE_ORDER,
  CHANGE_SYMBOLS,
  type OctoReport,
  type ReportResource,
  type ReportStory,
  type ReportUnexplained,
} from '../report.model.js';

/**
 * How long the run took, terraform named separately. See {@link OctoReport.terraformInMs}.
 */
function duration(report: OctoReport): string {
  const readable = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

  return report.terraformInMs > 0
    ? `${readable(report.durationInMs)} octo · ${readable(report.terraformInMs)} terraform`
    : readable(report.durationInMs);
}

/**
 * @internal
 */
function counters(report: OctoReport): string {
  const parts = CHANGE_ORDER.filter((kind) => kind !== 'other' || report.totals[kind] > 0).map(
    (kind) => `${CHANGE_SYMBOLS[kind]} ${report.totals[kind]} ${CHANGE_LABELS[kind]}`,
  );

  if (report.drift.length > 0) {
    parts.push(`⚠ ${report.drift.length} drift`);
  }

  return parts.join('   ');
}

/**
 * One octo resource and the terraform addresses under it, with the arguments each one moves.
 */
function resourceLines(resource: ReportResource, indent: string): string[] {
  const lines = [`${indent}${CHANGE_SYMBOLS[resource.kind]} ${resource.resourceId}`];
  const inner = `${indent}    `;

  if (resource.reason) {
    lines.push(`${inner}why: ${resource.reason}`);
  }

  if (resource.terraform.length === 0) {
    lines.push(`${inner}no infrastructure change`);
    return lines;
  }

  for (const row of [...resource.terraform].sort((a, b) => a.address.localeCompare(b.address))) {
    lines.push(`${inner}${CHANGE_SYMBOLS[row.kind]} ${row.address}`);
    if (row.explanation) {
      lines.push(`${inner}    ${row.explanation}`);
    }
    // A create has no `from` and a delete no `to`; the missing side prints as a dash so the arrow
    // always reads the same direction.
    for (const field of row.changedFields) {
      lines.push(`${inner}    ${field.field}: ${field.from ?? '-'} → ${field.to ?? '-'}`);
    }
    if (row.omittedFieldCount) {
      lines.push(`${inner}    ... ${row.omittedFieldCount} more field(s) changed`);
    }
  }

  return lines;
}

/**
 * @internal
 */
function storyLines(story: ReportStory): string[] {
  const miniTotals = CHANGE_ORDER.filter((kind) => story.totals[kind] > 0)
    .map((kind) => `${CHANGE_SYMBOLS[kind]}${story.totals[kind]}`)
    .join(' ');

  const tags = [
    story.nodeContext,
    story.moduleId,
    // No intent change explained these, so they were grouped by the module that rendered them.
    story.isDerived ? 'grouped by module' : undefined,
    miniTotals || undefined,
  ].filter((tag): tag is string => tag !== undefined);

  const lines = [`  ${CHANGE_SYMBOLS[story.kind]} ${story.title}${tags.length > 0 ? `  [${tags.join(' | ')}]` : ''}`];

  if (story.reason) {
    lines.push(`      why: ${story.reason}`);
  }
  if (story.terraformPlannedNothing) {
    lines.push(`      octo wants this changed, but terraform's plan touches none of its addresses`);
  }

  for (const resource of story.resources) {
    lines.push(...resourceLines(resource, '      '));
  }

  return lines;
}

/**
 * @internal
 */
function unexplainedLines(entries: ReportUnexplained[]): string[] {
  return [...entries]
    .sort((a, b) => a.address.localeCompare(b.address))
    .flatMap((entry) => {
      const lines = [`  ${CHANGE_SYMBOLS[entry.kind]} ${entry.address}  [${entry.moduleId}]`];
      if (entry.reason) {
        lines.push(`      ${entry.reason}`);
      }
      return lines;
    });
}

/**
 * A section, rendered only when it has rows.
 */
function section(lines: string[], heading: string, rows: string[]): void {
  if (rows.length === 0) {
    return;
  }
  lines.push('', heading, ...rows);
}

/**
 * The report as plain text, for a terminal.
 *
 * Built from {@link OctoReport} — the same data the HTML page renders, and every section it has.
 * The page's job is to be concise and pleasant to read, not to know more; so anything the terminal
 * cannot say is a gap in the report model rather than a reason to keep a second one. This replaced
 * a renderer in `octo-build` that read `validate`'s return value directly, which meant every
 * finding had to be implemented twice and the two drifted.
 */
export function renderReportText(report: OctoReport): string {
  const lines: string[] = [
    `${report.app} — octo ${report.mode} — ${report.outcome}${report.confidence ? ` (${report.confidence})` : ''}`,
    `${TimestampUtility.formatTimestamp(report.finishedAt)} · ${duration(report)}`,
    '',
    report.headline,
    counters(report),
  ];

  if (report.confidence === 'approximate') {
    lines.push(
      '',
      "Your intent changed, so each folder was planned on its own against its dependencies' last",
      'applied outputs. A cross-folder consequence of this change is invisible until apply. This',
      'report can both understate what apply will do and overstate drift.',
    );
  }

  if (report.mode === 'commit') {
    lines.push(
      '',
      "Commit runs after the apply, so there is no plan to read. This is octo's account of what it",
      "applied, reconstructed from its own records — not terraform's.",
    );
  }

  section(
    lines,
    'FAILURES — octo could not read these, so everything else is incomplete',
    report.failures.map((failure) => `  ${failure.moduleId ? `[${failure.moduleId}] ` : ''}${failure.message}`),
  );

  section(
    lines,
    report.mode === 'commit' ? 'WHAT CHANGED' : 'WHAT WILL CHANGE',
    report.stories.length > 0 ? report.stories.flatMap(storyLines) : ['  nothing'],
  );

  section(
    lines,
    'DATA LOSS — destroying these loses the data they hold',
    report.dataLoss.map((entry) => `  [${entry.moduleId}] ${entry.message}`),
  );

  section(
    lines,
    'MOVED BETWEEN MODULE FOLDERS — their terraform state moves with them',
    report.moves.map((move) => `  ${move.resourceId}: ${move.fromModuleId} → ${move.moduleId}`),
  );

  section(lines, 'DRIFT — nothing in your intent explains this', unexplainedLines(report.drift));

  if (report.drift.length > 0) {
    lines.push(
      report.drift.every((entry) => entry.kind === 'create')
        ? '  Your intent says these should exist and they do not.'
        : '  Your infrastructure no longer matches your intent, and nothing you changed explains it.',
      '    → run apply to bring it back in line with your intent, or',
      '    → change intent to accept reality, then generate + apply',
    );
  }

  section(
    lines,
    'UNCERTAIN — planned against a placeholder, so not judged as drift',
    unexplainedLines(report.uncertain),
  );

  section(
    lines,
    'MODULES THAT NO LONGER RENDER ANYTHING',
    [...(report.commit?.emptiedModuleIds ?? [])].sort((a, b) => a.localeCompare(b)).map((id) => `  ${id}`),
  );

  const moved = (report.commit?.responses ?? []).filter((response) => response.previousValue !== response.value);
  section(
    lines,
    'WHAT OCTO RECORDED — values that moved',
    moved.map(
      (response) =>
        `  ${response.resourceContext} ${response.key}: ${response.previousValue ?? '-'} → ${response.value}`,
    ),
  );

  section(
    lines,
    'NOTES',
    [...report.notes, ...(report.commit?.warnings ?? [])].map(
      (note) => `  ${note.moduleId ? `[${note.moduleId}] ` : ''}${note.message}`,
    ),
  );

  return lines.join('\n');
}
