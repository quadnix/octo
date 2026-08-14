import { DiffAction, type Octo } from '@quadnix/octo';

/**
 * Derived from the method that produces it rather than imported: octo does not export its modes, and
 * the report has no meaning apart from being what `validate` returns.
 */
export type ValidateReport = Awaited<ReturnType<Octo['validate']>>;

type ValidateOctoAction = ValidateReport['intentChanges'][number]['octoAction'];

/**
 * One line of the INFRASTRUCTURE CHANGES section: a terraform address, what terraform plans on it,
 * and, for a change derived from another, why.
 */
interface RenderedInfrastructureChange {
  address: string;
  explanation?: string;
  tfActions: string[];
}

const OCTO_ACTION_SYMBOLS: Record<ValidateOctoAction, string> = {
  [DiffAction.ADD]: '+',
  [DiffAction.DELETE]: '-',
  [DiffAction.REPLACE]: '±',
  [DiffAction.UPDATE]: '~',
};

/**
 * Collapses terraform's action list to one symbol. `create` + `delete` together is a recreate, and
 * carries its own mark.
 */
function terraformActionSymbol(tfActions: string[]): string {
  switch ([...tfActions].sort().join(',')) {
    case 'create':
      return '+';
    case 'create,delete':
      return '±';
    case 'delete':
      return '-';
    case 'update':
      return '~';
    default:
      return '?';
  }
}

/**
 * Groups changes by folder, the unit a reader acts on: one folder is one terraform root module with
 * its own state.
 */
function groupByModule<T>(entries: (T & { moduleId?: string })[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const entry of entries) {
    const moduleId = entry.moduleId ?? '(unknown module)';
    if (!grouped.has(moduleId)) {
      grouped.set(moduleId, []);
    }
    grouped.get(moduleId)!.push(entry);
  }

  return new Map([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

const EXPLANATION_WIDTH = 96;

/**
 * Wraps an explanation onto continuation lines aligned under its own text, so it reads as prose
 * attached to its address.
 */
function wrapExplanation(explanation: string, indent: string): string[] {
  const prefix = `${indent}    └─ `;
  const continuation = `${indent}       `;
  const lines: string[] = [];
  let current = '';

  for (const word of explanation.split(' ')) {
    if (current === '') {
      current = word;
    } else if (current.length + 1 + word.length <= EXPLANATION_WIDTH) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);

  return lines.map((line, index) => `${index === 0 ? prefix : continuation}${line}`);
}

function renderChangeLines(changes: RenderedInfrastructureChange[], indent: string): string[] {
  const lines: string[] = [];

  for (const change of [...changes].sort((a, b) => a.address.localeCompare(b.address))) {
    lines.push(`${indent}${terraformActionSymbol(change.tfActions)} ${change.address}`);
    if (change.explanation) {
      lines.push(...wrapExplanation(change.explanation, indent));
    }
  }

  return lines;
}

/**
 * Renders a {@link ValidateReport} for a human.
 *
 * Sections run FAILURES → CONFIDENCE → INTENT CHANGES → INFRASTRUCTURE CHANGES → UNCERTAIN → DRIFT →
 * NOTES. Confidence leads because an `approximate` report can both understate what apply will do and
 * overstate drift, and `uncertain` is rendered apart from drift so it never reads as one.
 */
export function renderValidateReport(report: ValidateReport): string {
  const lines: string[] = [];

  if (report.failures.length > 0) {
    lines.push('FAILURES — octo could not inspect these folders, so everything below is incomplete');

    for (const failure of report.failures) {
      const [head, ...rest] = failure.message.split('\n');
      lines.push(`  ${failure.moduleId ? `[${failure.moduleId}] ` : ''}${head}`);
      lines.push(...rest.map((line) => `    ${line}`));
    }

    lines.push('');
  }

  lines.push(`CONFIDENCE: ${report.confidence}`);
  lines.push(
    report.confidence === 'exact'
      ? '  Intent is unchanged, so every folder was planned against real applied values. Anything\n' +
          '  terraform wants to change is a real difference between intent and the cloud.'
      : "  Intent changed. Each folder is planned on its own, against its dependencies' *last applied*\n" +
          '  outputs, so a cross-folder consequence of this change is invisible until apply, and a\n' +
          '  renamed producer\'s outputs are substituted from "mock_outputs". This report can both\n' +
          '  understate what apply will do and overstate drift.',
  );
  lines.push('');

  lines.push('INTENT CHANGES (octo models)');

  if (report.intentChanges.length === 0) {
    lines.push('  none');
  } else {
    for (const intentChange of report.intentChanges) {
      const suffix = intentChange.terraformChanges.length === 0 ? '      → no infrastructure change' : '';
      lines.push(`  ${OCTO_ACTION_SYMBOLS[intentChange.octoAction]} ${intentChange.resourceContext}${suffix}`);
    }
  }

  lines.push('');

  // Directly requested and derived changes render as one list, with the derived ones explained
  // inline, so the reader sees a single account of what is about to happen.
  const infrastructureChanges: (RenderedInfrastructureChange & { moduleId?: string })[] = [
    ...report.intentChanges.flatMap((intentChange) =>
      intentChange.terraformChanges.map((change) => ({
        address: change.address,
        moduleId: intentChange.moduleId,
        tfActions: change.tfActions,
      })),
    ),
    ...report.attributedChanges.map((attributed) => ({
      address: attributed.address,
      explanation:
        attributed.causeKind === 'identity-changed'
          ? `references "${attributed.causeResourceId}", whose identity changed`
          : `"${attributed.causeResourceId}" no longer renders this address`,
      moduleId: attributed.moduleId,
      tfActions: attributed.tfActions,
    })),
  ];

  lines.push('INFRASTRUCTURE CHANGES (terraform)');

  if (infrastructureChanges.length === 0) {
    lines.push('  none attributable to an intent change');
  } else {
    for (const [moduleId, changes] of groupByModule(infrastructureChanges)) {
      lines.push(`  ${moduleId}`);
      lines.push(...renderChangeLines(changes, '    '));
    }
  }

  lines.push('');

  if (report.uncertain.length > 0) {
    lines.push('UNCERTAIN — planned against a placeholder value, so not judged');

    for (const [moduleId, entries] of groupByModule(report.uncertain)) {
      lines.push(`  ${moduleId}`);
      lines.push(
        ...renderChangeLines(
          entries.map((entry) => ({ address: entry.address, explanation: entry.reason, tfActions: entry.tfActions })),
          '    ',
        ),
      );
    }
    lines.push('');
  }

  if (report.drift.length === 0) {
    lines.push('No drift detected.');
  } else {
    lines.push('DRIFT — no intent change explains this');

    for (const [moduleId, entries] of groupByModule(report.drift)) {
      lines.push(`  ${moduleId}`);
      lines.push(...renderChangeLines(entries, '    '));
    }

    lines.push('');

    if (report.drift.every((entry) => [...entry.tfActions].sort().join(',') === 'create')) {
      lines.push('  Your intent says these should exist and they do not.');
      lines.push('    → run apply to restore them, or');
      lines.push('    → change intent to accept their absence, then generate + apply');
    } else {
      lines.push('  Your infrastructure no longer matches your intent, and nothing you changed explains it.');
      lines.push('    → run apply to bring it back in line with your intent, or');
      lines.push('    → change intent to accept reality, then generate + apply');
    }
  }

  if (report.notes.length > 0) {
    lines.push('');
    lines.push('NOTES');

    for (const note of report.notes) {
      lines.push(`  - ${note.moduleId ? `[${note.moduleId}] ` : ''}${note.message}`);
    }
  }

  return lines.join('\n');
}
