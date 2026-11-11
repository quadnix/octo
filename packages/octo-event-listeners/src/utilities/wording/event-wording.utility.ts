import type { EventPayloads, JournalEntry } from '../../journal.event.listener.js';

/**
 * One line the terminal logs for an event: its level, its words, and the metadata beside them.
 *
 * @group Event Listeners/Wording
 */
export type WordedLine = {
  level: 'debug' | 'error' | 'info' | 'warn';
  metadata: Record<string, unknown>;
  text: string;
};

/**
 * What the terminal knows of an event that its entry does not hold: the terraform time a mode
 * spent, and how long a resource action ran.
 *
 * @group Event Listeners/Wording
 */
export type WordingContext = {
  durationInMs?: number;
  terraformInMs?: number;
};

/**
 * What one event says, from its payload and its name.
 */
type Wording<T extends keyof EventPayloads> = (
  payload: EventPayloads[T],
  name: string,
  context: WordingContext,
) => WordedLine[];

/**
 * Words each event a journal records the way `LoggingEventListener` logs it in the terminal, so a
 * reader of a journal says what the terminal said. Imports nothing at run time, so it runs in a
 * browser.
 *
 * @example
 * ```ts
 * import { EventWordingUtility } from '@quadnix/octo-event-listeners/wording';
 *
 * for (const entry of journal.entries) {
 *   for (const line of EventWordingUtility.word(entry) ?? []) {
 *     console.log(line.level, line.text);
 *   }
 * }
 * ```
 *
 * @group Event Listeners/Wording
 */
export class EventWordingUtility {
  private static readonly HOOK_LINES: { [T in keyof EventPayloads]?: string } = {
    PostCommitHookCallbackDoneEvent: 'PostCommit hook callback executed.',
    PostModelActionHookCallbackDoneEvent: 'PostModelAction hook callback executed.',
    PostResourceActionHookCallbackDoneEvent: 'PostResourceAction hook callback executed.',
    PreCommitHookCallbackDoneEvent: 'PreCommit hook callback executed.',
    PreModelActionHookCallbackDoneEvent: 'PreModelAction hook callback executed.',
    PreResourceActionHookCallbackDoneEvent: 'PreResourceAction hook callback executed.',
  };

  private static readonly WORDINGS: { [T in keyof EventPayloads]?: Wording<T> } = {
    ActionEvent: (payload, name) => [
      { level: 'info', metadata: { name, payload: payload.metadata || {} }, text: payload.message || 'Action event.' },
    ],
    CommitModeCompletedEvent: ({ emptiedModuleIds, responses, warnings }) => {
      const movedCount = responses.filter((response) => response.previousValue !== response.value).length;
      return [
        {
          level: 'info',
          metadata: { emptiedModuleIds, movedCount, responseCount: responses.length },
          text: `Commit: recorded ${responses.length} response value(s), ${movedCount} changed.`,
        },
        ...warnings.map(
          (warning): WordedLine => ({ level: 'warn', metadata: { moduleId: warning.moduleId }, text: warning.message }),
        ),
      ];
    },
    ImportedStateChangedEvent: ({ importKey }) => {
      const subject = importKey.startsWith('stores:')
        ? `Store "${importKey.slice('stores:'.length)}"`
        : 'The state this app extends';
      return [
        {
          level: 'warn',
          metadata: { importKey },
          text: `${subject} changed since this app's last commit; this run builds on its newest.`,
        },
      ];
    },
    ModeFailedEvent: ({ appName, durationInMs, error, mode }) => [
      {
        level: 'error',
        metadata: { appName, durationInMs, mode },
        text: `Failed "${mode}" after ${durationInMs}ms: ${error.message}`,
      },
    ],
    ModeFinishedEvent: ({ appName, durationInMs, mode }, _name, { terraformInMs = 0 }) => [
      {
        level: 'info',
        metadata: { appName, durationInMs, mode, terraformInMs },
        text:
          `Finished "${mode}" in ${durationInMs}ms` +
          (terraformInMs > 0 ? `, after ${terraformInMs}ms in terraform.` : '.'),
      },
    ],
    ModelActionTransactionEvent: (_payload, name) => [
      { level: 'debug', metadata: { name }, text: 'Model action executed.' },
    ],
    ModelDiffsTransactionEvent: () => [{ level: 'debug', metadata: {}, text: 'Model diffs executed.' }],
    ModelTransactionTransactionEvent: () => [{ level: 'debug', metadata: {}, text: 'Model transactions executed.' }],
    ModeStartedEvent: ({ appName, mode, resourceId }) => [
      {
        level: 'info',
        metadata: { appName, mode, resourceId },
        text: `Started "${mode}" on "${appName}"${resourceId ? ` for resource "${resourceId}"` : ''}.`,
      },
    ],
    ModuleEvent: ({ moduleId }, name) => [{ level: 'debug', metadata: { moduleId, name }, text: 'Module loaded.' }],
    ResourceActionCompletedTransactionEvent: ({ node }, name, { durationInMs }) => [
      {
        level: 'info',
        metadata: { action: name, durationInMs, resource: node },
        text:
          `Resource action "${name}" completed on "${node}"` +
          (durationInMs === undefined ? '.' : ` in ${durationInMs}ms.`),
      },
    ],
    ResourceActionInitiatedTransactionEvent: ({ node }, name) => [
      {
        level: 'info',
        metadata: { action: name, resource: node },
        text: `Resource action "${name}" started on "${node}".`,
      },
    ],
    ResourceActionSummaryTransactionEvent: ({ diff, values }, name) => [
      { level: 'debug', metadata: { action: name, resource: diff.node, values }, text: 'Resource action summary.' },
    ],
    ResourceDiffsTransactionEvent: () => [{ level: 'debug', metadata: {}, text: 'Resource diffs executed.' }],
    ResourceTransactionTransactionEvent: () => [
      { level: 'debug', metadata: {}, text: 'Resource transactions executed.' },
    ],
    RunActionModeCompletedEvent: ({ action, predecessorResourceId, reason, resourceId }) => {
      const verdicts: Record<NonNullable<typeof reason> | Exclude<typeof action, 'noop'>, string> = {
        add: 'added',
        'already-done': 'nothing to do, its action already ran for these inputs',
        delete: 'deleted',
        'taken-from-predecessor': `nothing to do, took the response of "${predecessorResourceId}", which it renames`,
        unchanged: 'nothing to do, nothing changed since the last commit',
        update: 'updated',
      };
      return [
        {
          level: 'info',
          metadata: { action, predecessorResourceId, reason, resourceId },
          text: `Run-action "${resourceId}": ${verdicts[action === 'noop' ? reason! : action]}.`,
        },
      ];
    },
    TerraformCommandFinishedEvent: ({ command, dir, durationInMs, exitCode }) => [
      exitCode === 0
        ? {
            level: 'info',
            metadata: { command, dir, durationInMs, exitCode },
            text: `Terraform "${command}" finished in ${durationInMs}ms.`,
          }
        : {
            level: 'warn',
            metadata: { command, dir, durationInMs, exitCode },
            text: `Terraform "${command}" exited ${exitCode}.`,
          },
    ],
    TerraformCommandStartedEvent: ({ command, dir }) => [
      { level: 'info', metadata: { command, dir }, text: `Running terraform "${command}".` },
    ],
    TerraformFoldersWrittenEvent: ({ emptied, outputDir, written }) => [
      {
        level: 'info',
        metadata: { emptied, outputDir, written },
        text:
          `Wrote ${written.length} terragrunt folder(s) to "${outputDir}"` +
          (emptied.length > 0 ? `, emptied ${emptied.length} (deleted from intent).` : '.'),
      },
    ],
    TerraformProcessExitedEvent: ({ exitCode, processId }, name) => [
      { level: 'debug', metadata: { exitCode, processId }, text: `Exited "${name}" ${exitCode}.` },
    ],
    TerraformProcessStartedEvent: ({ args, binary, dir, processId }, name) => [
      { level: 'debug', metadata: { args, binary, dir, processId }, text: `Started ${binary} "${name}".` },
    ],
    ValidateModeCompletedEvent: ({ report }) => {
      const terraformChangeCount = report.intentChanges.reduce(
        (total, change) => total + change.terraformChanges.length,
        report.attributedChanges.length,
      );

      return [
        {
          level: 'info',
          metadata: {
            confidence: report.confidence,
            driftCount: report.drift.length,
            failureCount: report.failures.length,
            resourceChangeCount: report.intentChanges.length,
            terraformChangeCount,
            uncertainCount: report.uncertain.length,
          },
          text:
            `Validate: ${report.intentChanges.length} resource change(s), ` +
            `${terraformChangeCount} terraform change(s), ${report.drift.length} drift ` +
            `(${report.confidence}).`,
        },
        ...(report.drift.length > 0
          ? [
              {
                level: 'warn',
                metadata: { addresses: report.drift.map((entry) => entry.address) },
                text: `${report.drift.length} terraform change(s) are drift — nothing in intent explains them.`,
              } satisfies WordedLine,
            ]
          : []),
        ...report.failures.map(
          (failure): WordedLine => ({
            level: 'error',
            metadata: { moduleId: failure.moduleId },
            text: failure.message,
          }),
        ),
        ...report.dataLoss.map(
          (entry): WordedLine => ({
            level: 'warn',
            metadata: { address: entry.address, moduleId: entry.moduleId },
            text: entry.message,
          }),
        ),
        ...report.moves.map(
          (move): WordedLine => ({
            level: 'info',
            metadata: { fromModuleId: move.fromModuleId, moduleId: move.moduleId, resourceId: move.resourceId },
            text: `Resource "${move.resourceId}" moves from module "${move.fromModuleId}" to "${move.moduleId}".`,
          }),
        ),
        ...report.notes.map(
          (note): WordedLine => ({ level: 'debug', metadata: { moduleId: note.moduleId }, text: note.message }),
        ),
      ];
    },
  };

  /**
   * The lines the terminal logs for an entry, or `undefined` for an event it does not log.
   *
   * @param entry A journal entry, or an event's name, plain payload and class name.
   * @param context What the terminal knew beside the entry, which only these lines need.
   */
  static word(
    entry: Pick<JournalEntry, 'name' | 'payload' | 'type'>,
    context: WordingContext = {},
  ): WordedLine[] | undefined {
    const hookLine = EventWordingUtility.HOOK_LINES[entry.type];
    if (hookLine !== undefined) {
      return [{ level: 'debug', metadata: entry.name ? { name: entry.name } : {}, text: hookLine }];
    }

    // An entry's type names its payload, which TypeScript cannot carry into the lookup.
    const wording = EventWordingUtility.WORDINGS[entry.type] as Wording<typeof entry.type> | undefined;
    return wording?.(entry.payload as EventPayloads[typeof entry.type], entry.name, context);
  }
}
