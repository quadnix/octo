import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { hostname } from 'node:os';
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
  RegistrationEvent,
  SerializationEvent,
  StateFilesSavedEvent,
  StateFilesSavingEvent,
  StateManagementService,
  TerraformCommandOutputEvent,
} from '@quadnix/octo';
import { JournalUtility } from './utilities/journal/journal.utility.js';

const JOURNAL_VERSION = 1;

/**
 * One event, as the journal holds it.
 */
interface JournalEntry {
  /**
   * The event's subject, where its type alone does not say, such as a module's class name.
   */
  name: string;
  /**
   * The event's data, as plain JSON.
   */
  payload: unknown;
  /**
   * The event's place among every event this process created.
   */
  sequence: number;
  /**
   * When the event was created, as an ISO timestamp.
   */
  time: string;
  /**
   * The event's class name, such as `CommandStartedEvent`.
   */
  type: string;
}

/**
 * Everything one terraform or terragrunt process wrote. `stdout` is left out of a process asked for
 * JSON, whose output is data rather than a log.
 */
interface TerraformLogEntry {
  /**
   * The arguments the process ran with.
   */
  args: string[];
  /**
   * The binary, terragrunt or terraform.
   */
  binary: string;
  /**
   * The directory it ran in.
   */
  dir: string;
  /**
   * Its exit code; anything but 0 is a failure.
   */
  exitCode: number;
  /**
   * The `sequence` of its entry in the command's file.
   */
  sequence: number;
  /**
   * Everything it wrote to stderr.
   */
  stderr: string;
  /**
   * Everything it wrote to stdout, absent for a process asked for JSON.
   */
  stdout?: string;
  /**
   * When it exited, as an ISO timestamp.
   */
  time: string;
}

/**
 * Writes the journal: every event of this command, in the order it happened, into Octo's state.
 *
 * A command is one process, named after the CLI command it runs, or the mode where no command runs
 * it. Its events go to `journal.<commandId>.<command>.json`, and what terraform and terragrunt wrote to
 * `journal.<commandId>.<command>.terraform.json`. A copy of every model and resource state file
 * written is kept as `journal.<commandId>.<command>.<md5>.json`, so each version a command wrote
 * survives the next command overwriting it. Ids start with the time they were made, so files sort in
 * the order their commands started.
 *
 * The listener only creates files: {@link StateManagementService} archives them when the lock is
 * released. A command that runs under a lock, run when none is held, writes nothing, because its
 * files would belong to no lock. They are written with every other state file written, at the end of a command,
 * and before the lock is released, after which nothing more is recorded. It never fails a command: a write that
 * fails is reported on stderr. The one write that fails loudly is the one before the release, which
 * keeps the lock held.
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
   * The last write queued, so the next one waits for it.
   */
  private pending: Promise<void> = Promise.resolve();
  /**
   * State file contents not copied yet, by MD5.
   */
  private readonly pendingCopies = new Map<string, Buffer>();
  /**
   * When this command started, as an ISO timestamp.
   */
  private startedAt = new Date().toISOString();
  /**
   * Everything each terraform or terragrunt process wrote.
   */
  private terraformLog: TerraformLogEntry[] = [];
  /**
   * The MD5 of every copy this command already wrote.
   */
  private readonly writtenCopies = new Set<string>();

  /**
   * A new command id: a UTC timestamp to the millisecond, then 8 random hex.
   */
  private static createCommandId(): string {
    return `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomBytes(4).toString('hex')}`;
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
            event.payload.stateFiles.push(...this.buildStateFiles());
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
      return;
    }
    if (
      event instanceof CommandFailedEvent ||
      event instanceof CommandFinishedEvent ||
      (!this.isInCommand && (event instanceof ModeFailedEvent || event instanceof ModeFinishedEvent))
    ) {
      this.pending = this.pending.then(() => this.write()).catch((error) => this.warn(error));
      await this.pending;
    }
  }

  /**
   * The command's journal, its terraform log, and the state file copies not written yet. Empty before
   * a command begins.
   */
  private buildStateFiles(): Parameters<StateManagementService['saveStates']>[0] {
    if (!this.command) {
      return [];
    }

    const header = {
      command: this.command,
      commandId: this.commandId,
      host: hostname(),
      octoVersion: this.octoVersion,
      startedAt: this.startedAt,
      version: JOURNAL_VERSION,
    };
    const stateFiles: Parameters<StateManagementService['saveStates']>[0] = [
      {
        data: Buffer.from(
          JSON.stringify({ ...header, entries: [...this.entries].sort((a, b) => a.sequence - b.sequence) }, null, 2),
        ),
        stateFileName: this.fileName('json'),
      },
    ];
    if (this.terraformLog.length > 0) {
      stateFiles.push({
        data: Buffer.from(JSON.stringify({ ...header, outputs: this.terraformLog }, null, 2)),
        stateFileName: this.fileName('terraform.json'),
      });
    }
    for (const [md5, data] of this.pendingCopies.entries()) {
      stateFiles.push({ data, stateFileName: this.fileName(`${md5}.json`) });
    }

    return stateFiles;
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
   * Adds one event to the journal, as plain data taken the moment it arrives.
   */
  private record(event: Event<unknown>): void {
    if (
      event instanceof RegistrationEvent ||
      event instanceof SerializationEvent ||
      event instanceof StateFilesSavingEvent
    ) {
      return;
    }

    const entry: JournalEntry = {
      name: event.name,
      payload: undefined,
      sequence: event.header.sequence,
      time: new Date(event.header.timestamp).toISOString(),
      type: event.constructor.name,
    };

    if (event instanceof StateFilesSavedEvent) {
      void this.holdCopies(event.payload.stateFiles).catch((error) => this.warn(error));

      // Keep the files a command wrote, leaving out the journal's own.
      const stateFiles = event.payload.stateFiles.filter(
        ({ stateFileName }) =>
          !stateFileName.startsWith(JOURNAL_STATE_FILE_NAME_PREFIX) && !stateFileName.includes('/'),
      );
      if (stateFiles.length === 0) {
        return;
      }
      entry.payload = { stateFiles: stateFiles.map(({ md5, stateFileName }) => ({ md5, stateFileName })) };
    } else if (event instanceof TerraformCommandOutputEvent) {
      // Keep what the process wrote in the terraform log, and its place in the journal.
      const { args, binary, dir, exitCode, stderr, stdout } = event.payload;
      this.terraformLog.push({
        args,
        binary,
        dir,
        exitCode,
        sequence: entry.sequence,
        stderr,
        stdout: args.includes('-json') ? undefined : stdout,
        time: entry.time,
      });
      entry.payload = { args, binary, dir, exitCode };
    } else {
      entry.payload = JournalUtility.toPlain(event.payload);
    }

    this.entries.push(entry);
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
      this.startedAt = new Date().toISOString();
      this.terraformLog = [];
      this.writtenCopies.clear();
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

    const stateFiles = this.buildStateFiles();
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
