import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { type FileHandle, copyFile, mkdtemp, open, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  AppUnlockingEvent,
  CommandFailedEvent,
  CommandFinishedEvent,
  CommandStartedEvent,
  Container,
  Event,
  Factory,
  JOURNAL_COMMANDS_BEFORE_LOCK,
  JOURNAL_STATE_FILE_NAME_PREFIX,
  ModeFailedEvent,
  ModeFinishedEvent,
  ModeStartedEvent,
  OnEvent,
  StateFilesSavedEvent,
  StateFilesSavingEvent,
  StateManagementService,
  TerraformProcessExitedEvent,
  TerraformProcessOutputEvent,
  TerraformProcessStartedEvent,
} from '@quadnix/octo';
import { JournalUtility, type Plain } from './utilities/journal/journal.utility.js';

/**
 * What closes the terraform log. Each record is written over it, followed by it again, so the file
 * is valid JSON after every record.
 */
const TERRAFORM_LOG_END = '\n]}\n';

/**
 * Each event a journal records, by its class name, mapped to its payload as the journal holds it. An
 * event without a payload has none in its entry.
 *
 * @group Event Listeners/Journal
 */
export type EventPayloads = {
  [K in keyof typeof JournalUtility.EVENT_CLASSES]: K extends 'StateFilesSavedEvent'
    ? {
        /**
         * Every state file the save wrote, but the journal's own; an entry is recorded only when one is
         * left. A file copied from a path, or deleted, has no `md5`.
         */
        stateFiles: { md5?: string; stateFileName: string }[];
      }
    : Plain<InstanceType<(typeof JournalUtility.EVENT_CLASSES)[K]>['payload']>;
};

/**
 * What every journal file of one command starts with.
 *
 * @group Event Listeners/Journal
 */
export type JournalHeader = {
  /**
   * The CLI command, such as `validate`, or the mode where no command ran it.
   */
  command: string;
  /**
   * Unix milliseconds when the command started, then 8 random hex: `1767225600000-0a1b2c3d`.
   */
  commandId: string;
  host: string;
  /**
   * The version of `@quadnix/octo` the command ran, absent when it could not be read.
   */
  octoVersion?: string;
  /**
   * The command that started this one, such as the `apply` a `run-action` ran inside.
   */
  parentCommandId?: string;
  /**
   * When the command started, in Unix milliseconds.
   */
  startedAt: number;
  /**
   * The format of the journal files.
   */
  version: 1;
};

/**
 * One event of a command, as its journal holds it. Narrow on `type` to read its payload.
 *
 * @group Event Listeners/Journal
 */
export type JournalEntry = {
  [K in keyof EventPayloads]: {
    /**
     * The event's subject, where its type alone does not say, such as a module's class name; empty
     * otherwise.
     */
    name: string;
    /**
     * The event's place among every event the command's process created, shared with the terraform log.
     */
    sequence: number;
    /**
     * When the event was created, in Unix milliseconds.
     */
    time: number;
    type: K;
  } & (EventPayloads[K] extends undefined ? { payload?: undefined } : { payload: EventPayloads[K] });
}[keyof EventPayloads];

/**
 * `journal.<commandId>.<command>.json`: every event of one command, in the order it happened.
 *
 * Beside it, `journal.<commandId>.<command>.<md5>.json` keeps each version of `models.json`,
 * `resources-actual.json`, `resources-old.json` or an external resource's record the command wrote,
 * named by the MD5 of its contents, as its `StateFilesSavedEvent` entry names it.
 *
 * @group Event Listeners/Journal
 */
export type JournalFile = JournalHeader & {
  entries: JournalEntry[];
};

/**
 * One record of a terraform log: a process starting, a chunk it wrote, or its exit. `process` tells
 * apart the command's processes, and `sequence` places the record among the command's events.
 *
 * @group Event Listeners/Journal
 */
export type TerraformLogRecord =
  | { args: string[]; binary: string; dir: string; process: number; sequence: number; time: number; type: 'started' }
  | { process: number; sequence: number; stream: 'stderr' | 'stdout'; text: string; time: number; type: 'output' }
  | { exitCode: number; process: number; sequence: number; time: number; type: 'exited' };

/**
 * `journal.<commandId>.<command>.terraform.json`: everything terraform and terragrunt wrote during one
 * command, chunk by chunk, in the order it arrived.
 *
 * @group Event Listeners/Journal
 */
export type TerraformLogFile = JournalHeader & {
  outputs: TerraformLogRecord[];
};

/**
 * The environment variable naming the command a process runs, set for the processes it starts. A
 * `run-action` that terraform starts mid-apply reads it as the command that started it.
 */
const COMMAND_ID_VARIABLE_NAME = 'OCTO_JOURNAL_COMMAND_ID';

/**
 * The terraform log file a command is writing.
 */
interface OpenTerraformLog {
  /**
   * The temporary directory holding the file, removed with it.
   */
  directory: string;
  file: FileHandle;
  filePath: string;
  /**
   * Whether no record was written yet.
   */
  isEmpty: boolean;
  /**
   * Where {@link TERRAFORM_LOG_END} starts, which is where the next record goes.
   */
  position: number;
  /**
   * Removes the directory if the process exits before the file is closed.
   */
  removeOnExit: () => void;
  /**
   * How many snapshots of the file were taken for a save, which names the next.
   */
  snapshotCount: number;
}

/**
 * Writes the journal: every event of this command, in the order it happened, into Octo's state.
 *
 * A command is one process, named after the CLI command it runs, or the mode where no command runs
 * it. Its events go to `journal.<commandId>.<command>.json`, and what terraform and terragrunt wrote to
 * `journal.<commandId>.<command>.terraform.json`, each chunk as it arrives.
 * A copy of every model and resource state file written is kept as `journal.<commandId>.<command>.<md5>.json`,
 * so each version a command wrote survives the next command overwriting it.
 * Ids start with the time they were made, so files sort in the order their commands started.
 *
 * The listener only creates files: {@link StateManagementService} archives them when the lock is
 * released. A command that runs under a lock, run when none is held, writes nothing, because its
 * files would belong to no lock. They are written with every other state file written, at the end of a command,
 * and before the lock is released, after which nothing more is recorded. It never fails a command: a write that
 * fails is reported on stderr. The one write that fails loudly is the one before the release, which
 * keeps the lock held.
 *
 * The terraform log is written to a temporary file as each chunk arrives, and holds nothing in memory.
 * That file is valid JSON after every chunk. Each state save takes a copy of it on disk and hands the
 * state provider that copy's path, so an apply's output reaches the state provider at every terraform
 * state check-in without ever being read into memory. It is deleted when the command ends.
 *
 * A command that another one started, such as a `run-action` terraform starts mid-apply, names that
 * command as `parentCommandId`.
 *
 * @group Event Listeners
 */
export class JournalEventListener {
  /**
   * The CLI command, or the mode, this process runs. Undefined until one begins.
   */
  private command: string | undefined;
  /**
   * A UTC timestamp to the millisecond, then 8 random hex, so ids sort by when commands started.
   */
  private commandId = JournalEventListener.createCommandId();
  /**
   * Every event recorded so far.
   */
  private entries: JournalEntry[] = [];
  /**
   * Whether an `octo` command announced itself, which then decides when the journal is written. A
   * driver that announces no command, such as `runModules`, runs each mode as a command of its own.
   */
  private isInCommand = false;
  /**
   * Whether the lock was released, after which nothing is recorded or written.
   */
  private isReleased = false;
  /**
   * Whether this command writes at all, settled at its first write.
   */
  private isWritten: Promise<boolean> | undefined;
  /**
   * The version of `@quadnix/octo` this command uses.
   */
  private readonly octoVersion = this.readOctoVersion();
  /**
   * The state file lists this listener saves itself, which it adds nothing to.
   */
  private readonly ownStateFiles = new WeakSet<object>();
  /**
   * The command of the process that started this one, when there is one.
   */
  private readonly parentCommandId = process.env[COMMAND_ID_VARIABLE_NAME];
  /**
   * The last write queued, so the next one waits for it.
   */
  private pending: Promise<void> = Promise.resolve();
  /**
   * State file contents not copied yet, by MD5.
   */
  private readonly pendingCopies = new Map<string, Buffer>();
  /**
   * When this command started, in Unix milliseconds.
   */
  private startedAt = Date.now();
  /**
   * The terraform log file this command is writing, opened at its first record.
   */
  private terraformLog: OpenTerraformLog | undefined;
  /**
   * The last change to the terraform log queued, so the next one waits for it.
   */
  private terraformLogQueue: Promise<void> = Promise.resolve();
  /**
   * The snapshots of the terraform log a save carries and has not finished with.
   */
  private readonly terraformLogSnapshotPaths = new Set<string>();
  /**
   * The MD5 of every copy this command already wrote.
   */
  private readonly writtenCopies = new Set<string>();

  /**
   * Names this command to every process it starts.
   */
  constructor() {
    process.env[COMMAND_ID_VARIABLE_NAME] = this.commandId;
  }

  /**
   * A new command id: the Unix time in milliseconds, then 8 random hex.
   */
  private static createCommandId(): string {
    return `${Date.now()}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * Records every event but registrations and serializations, adds the journal to every state save,
   * and writes it at the end of a command, or a mode outside one, and before the lock is released.
   */
  @OnEvent(Event)
  async onEvent(event: Event<unknown>): Promise<void> {
    if (this.isReleased) {
      return;
    }

    // Name the command.
    if (event instanceof CommandStartedEvent) {
      this.command = event.payload.command;
      this.isInCommand = true;
    } else if (event instanceof ModeStartedEvent && !this.isInCommand) {
      this.startCommand(event.payload.mode);
    }

    try {
      this.record(event);
    } catch (error) {
      this.warn(error);
    }

    if (event instanceof StateFilesSavingEvent) {
      if (!this.ownStateFiles.has(event.payload.stateFiles)) {
        try {
          if (await this.isWrittenAtAll()) {
            event.payload.stateFiles.push(...(await this.buildStateFiles()));
          }
        } catch (error) {
          this.warn(error);
        }
      }
      return;
    }
    if (event instanceof AppUnlockingEvent) {
      // The last write before the release, which fails the release when it fails.
      const lastWrite = this.pending.then(() => this.write());
      this.pending = lastWrite.catch(() => undefined);
      await lastWrite;
      this.isReleased = true;
      await this.closeTerraformLog();
      return;
    }
    if (
      event instanceof CommandFailedEvent ||
      event instanceof CommandFinishedEvent ||
      (!this.isInCommand && (event instanceof ModeFailedEvent || event instanceof ModeFinishedEvent))
    ) {
      this.pending = this.pending.then(() => this.write()).catch((error) => this.warn(error));
      await this.pending;
      await this.closeTerraformLog();
    }
  }

  /**
   * Adds a record to the terraform log, opening it at the first. Each is written over the end of the
   * file, followed by the end again, so the file stays valid JSON. Nothing is recorded before a command
   * is named, since a journal is only written for a command.
   */
  private appendTerraformLog(record: TerraformLogRecord): void {
    if (!this.command) {
      return;
    }

    const header = this.buildHeader(this.command);
    this.terraformLogQueue = this.terraformLogQueue
      .then(async () => {
        this.terraformLog ??= await this.openTerraformLog(header);
        const log = this.terraformLog;

        const data = Buffer.from(`${log.isEmpty ? '' : ',\n'}${JSON.stringify(record)}${TERRAFORM_LOG_END}`);
        await log.file.write(data, 0, data.length, log.position);
        log.isEmpty = false;
        log.position += data.length - Buffer.byteLength(TERRAFORM_LOG_END);
      })
      .catch((error) => this.warn(error));
  }

  /**
   * What every journal file of this command starts with.
   */
  private buildHeader(command: string): JournalHeader {
    return {
      command,
      commandId: this.commandId,
      host: hostname(),
      octoVersion: this.octoVersion,
      ...(this.parentCommandId === undefined ? {} : { parentCommandId: this.parentCommandId }),
      startedAt: this.startedAt,
      version: 1,
    };
  }

  /**
   * The command's journal, its terraform log, and the state file copies not written yet. Empty before
   * a command begins.
   */
  private async buildStateFiles(): Promise<Parameters<StateManagementService['saveStates']>[0]> {
    if (!this.command) {
      return [];
    }

    const header = this.buildHeader(this.command);
    const stateFiles: Parameters<StateManagementService['saveStates']>[0] = [
      {
        data: Buffer.from(
          JSON.stringify({ ...header, entries: [...this.entries].sort((a, b) => a.sequence - b.sequence) }, null, 2),
        ),
        stateFileName: this.fileName('json'),
      },
    ];
    const terraformLogSnapshotPath = await this.snapshotTerraformLog();
    if (terraformLogSnapshotPath) {
      stateFiles.push({ filePath: terraformLogSnapshotPath, stateFileName: this.fileName('terraform.json') });
    }
    for (const [md5, data] of this.pendingCopies.entries()) {
      stateFiles.push({ data, stateFileName: this.fileName(`${md5}.json`) });
    }

    return stateFiles;
  }

  /**
   * Closes the terraform log and deletes it, once every record queued is written.
   */
  private async closeTerraformLog(): Promise<void> {
    this.terraformLogQueue = this.terraformLogQueue
      .then(async () => {
        const log = this.terraformLog;
        this.terraformLog = undefined;
        if (!log) {
          return;
        }

        process.off('exit', log.removeOnExit);
        await log.file.close();
        await rm(log.directory, { force: true, recursive: true });
      })
      .catch((error) => this.warn(error));
    await this.terraformLogQueue;
  }

  /**
   * The name of one of this command's journal files.
   */
  private fileName(rest: string): string {
    return `${JOURNAL_STATE_FILE_NAME_PREFIX}${this.commandId}.${this.command}.${rest}`;
  }

  /**
   * The state management service, or `undefined` when no state provider was booted, and so there is
   * nowhere to write.
   */
  private async getStateManagementService(): Promise<StateManagementService | undefined> {
    try {
      return await Container.getInstance().get(StateManagementService);
    } catch {
      return undefined;
    }
  }

  /**
   * Holds the contents of each model and resource state file, and each external resource record, a
   * save wrote, until a journal write copies them. Marks the copies the save itself carried as written.
   */
  private async holdCopies(stateFiles: StateFilesSavedEvent['payload']['stateFiles']): Promise<void> {
    const stateManagementService = await this.getStateManagementService();
    if (!stateManagementService) {
      return;
    }

    const copiedStateFileNames = [
      stateManagementService.actualResourceStateFileName,
      stateManagementService.modelStateFileName,
      stateManagementService.oldResourceStateFileName,
    ];
    for (const { data, md5, stateFileName } of stateFiles) {
      if (!data || !md5) {
        continue;
      }

      if (this.pendingCopies.has(md5) && stateFileName === this.fileName(`${md5}.json`)) {
        this.pendingCopies.delete(md5);
        this.writtenCopies.add(md5);
        continue;
      }

      const isCopied =
        copiedStateFileNames.includes(stateFileName) ||
        stateFileName.startsWith(stateManagementService.externalResourceStateFileNamePrefix);
      if (isCopied && !this.writtenCopies.has(md5)) {
        this.pendingCopies.set(md5, data);
      }
    }
  }

  /**
   * Whether this command writes at all. One that runs under a lock writes nothing when no lock is
   * held. A lock that cannot be read counts as held, so a failure is still recorded.
   */
  private async isWrittenAtAll(): Promise<boolean> {
    if (!this.command || JOURNAL_COMMANDS_BEFORE_LOCK.includes(this.command)) {
      return true;
    }

    this.isWritten ??= this.getStateManagementService().then(
      async (stateManagementService) => !stateManagementService || !!(await stateManagementService.getAppLock()),
      () => true,
    );
    return this.isWritten.catch(() => true);
  }

  /**
   * Opens a new terraform log in a temporary directory, holding the header and no records, and
   * removes it if the process exits before it is closed.
   */
  private async openTerraformLog(header: JournalHeader): Promise<OpenTerraformLog> {
    const directory = await mkdtemp(join(tmpdir(), 'octo-journal-'));
    const filePath = join(directory, 'terraform.json');
    const removeOnExit = (): void => rmSync(directory, { force: true, recursive: true });
    process.once('exit', removeOnExit);

    const file = await open(filePath, 'w');
    const start = Buffer.from(`${JSON.stringify(header).slice(0, -1)},"outputs":[\n`);
    const data = Buffer.concat([start, Buffer.from(TERRAFORM_LOG_END)]);
    await file.write(data, 0, data.length, 0);

    return { directory, file, filePath, isEmpty: true, position: start.length, removeOnExit, snapshotCount: 0 };
  }

  /**
   * The version of `@quadnix/octo` this command uses, read from its `package.json`.
   */
  private readOctoVersion(): string | undefined {
    try {
      let directory = dirname(createRequire(import.meta.url).resolve('@quadnix/octo'));
      while (directory !== dirname(directory)) {
        const packageJsonPath = join(directory, 'package.json');
        if (existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          if (packageJson.name === '@quadnix/octo') {
            return packageJson.version;
          }
        }
        directory = dirname(directory);
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  /**
   * Adds one event to the journal, as plain data taken the moment it arrives. An event of a class the
   * journal does not record is left out.
   */
  private record(event: Event<unknown>): void {
    const { sequence, timestamp: time } = event.header;

    // Keep each chunk in the terraform log rather than the journal.
    if (event instanceof TerraformProcessOutputEvent) {
      const { processId, stream, text } = event.payload;
      this.appendTerraformLog({ process: processId, sequence, stream, text, time, type: 'output' });
      return;
    }

    const eventClass: unknown = event.constructor;
    const type = event.constructor.name as keyof EventPayloads;
    if (JournalUtility.EVENT_CLASSES[type] !== eventClass) {
      return;
    }

    let payload: unknown;
    if (event instanceof StateFilesSavedEvent) {
      void this.holdCopies(event.payload.stateFiles).catch((error) => this.warn(error));

      // Delete the terraform log snapshots the save carried, which it no longer needs.
      for (const { filePath } of event.payload.stateFiles) {
        if (filePath && this.terraformLogSnapshotPaths.delete(filePath)) {
          void rm(filePath, { force: true }).catch((error) => this.warn(error));
        }
      }

      // Keep the files a command wrote, leaving out the journal's own.
      const stateFiles = event.payload.stateFiles.filter(
        ({ stateFileName }) =>
          !stateFileName.startsWith(JOURNAL_STATE_FILE_NAME_PREFIX) && !stateFileName.includes('/'),
      );
      if (stateFiles.length === 0) {
        return;
      }
      payload = {
        stateFiles: stateFiles.map(({ md5, stateFileName }) => ({ md5, stateFileName })),
      } satisfies EventPayloads['StateFilesSavedEvent'];
    } else if (event instanceof TerraformProcessStartedEvent) {
      // Open the process in the terraform log, and keep its place in the journal.
      const { args, binary, dir, processId } = event.payload;
      this.appendTerraformLog({ args, binary, dir, process: processId, sequence, time, type: 'started' });
      payload = { args, binary, dir, processId } satisfies EventPayloads['TerraformProcessStartedEvent'];
    } else if (event instanceof TerraformProcessExitedEvent) {
      // Close the process in the terraform log, and keep its place in the journal.
      const { exitCode, processId } = event.payload;
      this.appendTerraformLog({ exitCode, process: processId, sequence, time, type: 'exited' });
      payload = { exitCode, processId } satisfies EventPayloads['TerraformProcessExitedEvent'];
    } else {
      payload = JournalUtility.toPlain(event.payload);
    }

    this.entries.push({ name: event.name, payload, sequence, time, type } as JournalEntry);
  }

  /**
   * Copies the terraform log as it stands, once every record queued is written, beside it, and returns
   * the copy's path, or `undefined` when nothing was recorded. A save uploads the copy while the log
   * keeps growing; the copy is deleted once the save is done, or with the log.
   */
  private async snapshotTerraformLog(): Promise<string | undefined> {
    const snapshot = this.terraformLogQueue.then(async () => {
      const log = this.terraformLog;
      if (!log) {
        return undefined;
      }

      const snapshotPath = join(log.directory, `snapshot-${++log.snapshotCount}.json`);
      await copyFile(log.filePath, snapshotPath);
      this.terraformLogSnapshotPaths.add(snapshotPath);
      return snapshotPath;
    });
    this.terraformLogQueue = snapshot.then(
      () => undefined,
      () => undefined,
    );
    return snapshot;
  }

  /**
   * Starts a new command in this process, for a driver that runs each mode as one. The first mode
   * names the command the process already started.
   */
  private startCommand(command: string): void {
    if (this.command) {
      this.commandId = JournalEventListener.createCommandId();
      this.entries = [];
      this.isWritten = undefined;
      this.startedAt = Date.now();
      this.writtenCopies.clear();
      void this.closeTerraformLog();
      process.env[COMMAND_ID_VARIABLE_NAME] = this.commandId;
    }
    this.command = command;
  }

  /**
   * Reports a journal failure on stderr, which stays free of a command's own output.
   */
  private warn(error: unknown): void {
    process.stderr.write(`journal: ${(error as Error)?.message ?? String(error)}\n`);
  }

  /**
   * Writes the command's journal, its terraform log, and the state file copies not written yet, as one
   * change.
   */
  private async write(): Promise<void> {
    // Let events already emitted reach the journal first.
    await new Promise((resolve) => setImmediate(resolve));

    const stateManagementService = await this.getStateManagementService();
    if (!stateManagementService || !(await this.isWrittenAtAll())) {
      return;
    }

    const stateFiles = await this.buildStateFiles();
    if (stateFiles.length === 0) {
      return;
    }
    this.ownStateFiles.add(stateFiles);
    await stateManagementService.saveStates(stateFiles);
  }
}

/**
 * @internal
 */
@Factory<JournalEventListener>(JournalEventListener)
export class JournalEventListenerFactory {
  private static instance: JournalEventListener;

  /**
   * @internal
   */
  static async create(): Promise<JournalEventListener> {
    this.instance ??= new JournalEventListener();
    return this.instance;
  }
}
