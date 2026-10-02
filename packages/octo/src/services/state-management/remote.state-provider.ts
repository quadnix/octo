import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { TransactionError } from '../../errors/index.js';
import { FileUtility } from '../../utilities/file/file.utility.js';
import { HttpUtility } from '../../utilities/http/http.utility.js';
import { LocalStateProvider } from './local.state-provider.js';
import type { IStateProvider } from './state-provider.interface.js';

const APP_LOCK_SCOPE = ['app'];
const LOCK_FILE_NAME = 'remote-state.lock';
const MAXIMUM_STATE_FILES = 200;
const MAXIMUM_STATE_FILE_SIZE_IN_BYTES = 5 * 1024 * 1024;
const STATE_FILE_CONTENT_TYPE = 'application/json';
const STATE_FILE_EXTENSIONS = ['.json', '.tfstate'];
const STATE_FILE_NAME_MAX_LENGTH = 255;
const STATE_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;
const UPLOAD_LOCK_FILE_NAME = 'remote-state-upload.lock';
const UPLOAD_LOCK_RETRY_IN_MS = 50;

/**
 * A lock the backend holds on this app.
 */
interface RemoteAppLock {
  commitId: string;
  context: string;
  lockId: string;
  takenAt: number;
  takenBy: string;
}

/**
 * A state record the backend holds, as far as this provider reads one.
 */
interface RemoteState {
  commitId: string;
  phase: 'apply' | 'commit';
  stateFiles: { filename: string; md5: string }[];
}

/**
 * The provider's lock file, `remote-state.lock`, beside the state files. It is never uploaded.
 *
 * `refreshedCommitId` is the sealed record `refreshState` last brought the directory to. `run` is
 * the run the directory belongs to while one is open, with the digest of every file its record
 * holds. Written by `refreshState`, completed by `lockApp`, deleted by `unlockApp`.
 */
interface RemoteStateLockFile {
  refreshedCommitId?: string;
  run?: { commitId: string; lockId: string; stateFiles: { [stateFileName: string]: string } };
}

/**
 * Keeps state in Octo's managed backend, so a team shares one store and no machine holds the only copy.
 *
 * A run reads and writes a state directory on disk, exactly as {@link LocalStateProvider} does, and
 * the backend is kept in step with it:
 *
 * - {@link RemoteStateProvider.refreshState} brings the directory up to the newest sealed state, and
 *   is what `octo generate` plans against.
 * - {@link RemoteStateProvider.lockApp} opens a new record for the run, refusing when the newest
 *   sealed state has moved since the directory was refreshed.
 * - Every write under the lock lands in the directory and in the run's record before it returns, so
 *   a run that dies leaves a record somebody can finish from another machine.
 * - {@link RemoteStateProvider.unlockApp} seals the record and releases the lock.
 *
 * Two files of the provider's own sit beside the state files and are never uploaded:
 * `remote-state.lock` records the run the directory belongs to and is deleted when the lock is
 * released, and `remote-state-upload.lock` makes the octo processes of one machine write to the
 * backend one at a time and is deleted after every write.
 *
 * @example
 * ```ts
 * await octo.initialize(
 *   new RemoteStateProvider({
 *     appId: 'my-app',
 *     localStateDirectoryPath: './.octo',
 *     organizationId: 'my-organization',
 *     sessionId: process.env.OCTO_SESSION!,
 *     stateManagementServiceUrl: 'http://localhost:3619/state',
 *   }),
 * );
 * ```
 *
 * @group Services/State Management
 *
 * @see Techniques for [State Providers](/docs/techniques/state-providers).
 */
export class RemoteStateProvider implements IStateProvider {
  private readonly appId: string;

  private readonly localStateDirectoryPath: string;

  private readonly localStateProvider: LocalStateProvider;

  private readonly lockContext: string;

  private readonly organizationId: string;

  private readonly sessionId: string;

  private readonly stateManagementServiceUrl: string;

  /**
   * @param options `organizationId` and `appId` name the app whose state this is, and `sessionId`
   * is the session the run acts as. `stateManagementServiceUrl` is the backend service, including
   * the prefix its routes sit behind. `localStateDirectoryPath` is the directory state files are
   * written into. `lockContext` is what a blocked run is shown about the holder.
   */
  constructor(options: {
    appId: string;
    localStateDirectoryPath: string;
    lockContext?: string;
    organizationId: string;
    sessionId: string;
    stateManagementServiceUrl: string;
  }) {
    this.appId = options.appId;
    this.localStateDirectoryPath = resolve(options.localStateDirectoryPath);
    this.localStateProvider = new LocalStateProvider(options.localStateDirectoryPath);
    this.lockContext = options.lockContext ?? `octo on ${hostname()}`;
    this.organizationId = options.organizationId;
    this.sessionId = options.sessionId;
    this.stateManagementServiceUrl = options.stateManagementServiceUrl.replace(/\/+$/, '');
  }

  /**
   * The id of the lock currently held, or `undefined` when the app is unlocked.
   */
  async getAppLock(): Promise<string | undefined> {
    const locks = await this.readAppLocks();
    return locks[0]?.lockId;
  }

  /**
   * Reads a state file.
   *
   * @throws {@link TransactionError} With the message `No state found!` when the file does not exist.
   */
  async getState(stateFileName: string): Promise<Buffer> {
    return this.localStateProvider.getState(stateFileName);
  }

  /**
   * Whether `lockId` is the lock currently held.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is held,
   * and when `lockId` is held but was neither taken nor resumed in this state directory.
   */
  async isAppLocked(lockId: string): Promise<boolean> {
    const locks = await this.readAppLocks();

    if (locks.some((lock) => lock.lockId === lockId)) {
      const lockFile = await this.readLockFile();
      if (lockFile.run?.lockId !== lockId) {
        throw new TransactionError(
          `Invalid lock ID! Lock "${lockId}" was not taken in this state directory. Resume it here first.`,
        );
      }
      return true;
    }
    if (locks.length > 0) {
      throw new TransactionError('Invalid lock ID!');
    }

    return false;
  }

  /**
   * The names of the state files whose name starts with `prefix`.
   */
  async listStates(prefix: string): Promise<string[]> {
    return this.localStateProvider.listStates(prefix);
  }

  /**
   * Takes the app lock and opens the run's record with everything the state directory holds.
   *
   * With `lockId`, resumes the run already holding that lock instead - from any machine, as the
   * account that took it or an organization administrator. The state directory is replaced with
   * what that run wrote so far, and every write after lands in its record.
   *
   * @throws {@link TransactionError} When a lock is held, naming the id that holds it. When the
   * newest sealed state moved since {@link RemoteStateProvider.refreshState} last ran. When
   * `lockId` is given and is not held.
   */
  async lockApp(lockId?: string): Promise<{ lockId: string }> {
    if (lockId) {
      return this.resumeAppLock(lockId);
    }

    return this.withUploadLock(async () => {
      const lockFile = await this.readLockFile();

      // Take the lock, naming a commit no run has used, since a sealed commit cannot be locked again.
      const commitId = `${new Date().toISOString().replace(/[-:.]/g, '')}-${randomBytes(4).toString('hex')}`;
      const response = await HttpUtility.sendJson(`${this.appStateUrl()}/lock`, {
        body: { commitId, context: this.lockContext, scope: APP_LOCK_SCOPE },
        headers: this.authorizationHeader(),
        method: 'POST',
      });
      if (!response.ok) {
        const message = await HttpUtility.readErrorMessage(response);
        const [holder] = response.status === 409 ? await this.readAppLocks() : [];
        if (holder) {
          throw new TransactionError(
            `App already locked with lock ID "${holder.lockId}", taken by "${holder.context}" ` +
              `since ${new Date(holder.takenAt).toISOString()}!`,
          );
        }
        throw new TransactionError(`Failed to lock the app: ${message}`);
      }
      const lock = (await response.json()) as RemoteAppLock;

      // Refuse a run on a state that moved since the directory was refreshed, and open its record.
      // Nothing is sealed by releasing a lock whose record was never written.
      try {
        const newestState = await this.readNewestState();
        if (newestState?.commitId !== lockFile.refreshedCommitId || (newestState && newestState.phase !== 'commit')) {
          throw new TransactionError('App state moved since it was last refreshed! Run "octo generate" again.');
        }

        const run = { commitId: lock.commitId, lockId: lock.lockId, stateFiles: {} };
        run.stateFiles = await this.writeRunState(run);
        await this.writeLockFile({ refreshedCommitId: lockFile.refreshedCommitId, run });
      } catch (error) {
        await this.releaseAppLock(lock.lockId).catch(() => undefined);
        throw error;
      }

      return { lockId: lock.lockId };
    });
  }

  /**
   * Brings the state directory up to the newest sealed state, which is what a run plans against.
   *
   * A directory an open run is still writing is left alone. A directory the backend holds nothing
   * for is left alone too: that is a first run, or a project arriving from another provider, and the
   * files on disk are the only copy there is.
   */
  async refreshState(): Promise<void> {
    await this.withUploadLock(async () => {
      const lockFile = await this.readLockFile();

      // Keep the directory of a run whose lock is still held.
      if (lockFile.run) {
        const locks = await this.readAppLocks();
        if (locks.some((lock) => lock.lockId === lockFile.run!.lockId)) {
          return;
        }
      }

      // Skip the download when the directory already holds the newest sealed state.
      const newestState = await this.readNewestState();
      if (newestState?.phase === 'commit' && newestState.commitId === lockFile.refreshedCommitId) {
        await this.writeLockFile({ refreshedCommitId: lockFile.refreshedCommitId });
        return;
      }

      const response = await HttpUtility.send(`${this.appStateUrl()}/latest`, {
        headers: this.authorizationHeader(),
      });
      if (response.status === 404) {
        await this.deleteLockFile();
        return;
      }
      if (!response.ok) {
        throw new TransactionError(`Failed to read the app state: ${await HttpUtility.readErrorMessage(response)}`);
      }

      const { state } = await this.replaceStateFiles(response);
      await this.writeLockFile({ refreshedCommitId: state.commitId });
    });
  }

  /**
   * Writes state files, deleting each one given no `data`, and then writes the run's record once for
   * all of them when a run is open.
   *
   * @throws {@link TransactionError} When the backend would refuse a file: a name it does not accept,
   * a file over 5MB, or one file more than the 200 a state may hold. Nothing is written then.
   */
  async saveStates(stateFiles: { data: Buffer | undefined; stateFileName: string }[]): Promise<void> {
    const existingStateFileNames = await this.stateFileNames();
    const stateFileNames = new Set(existingStateFileNames);

    // Refuse the whole change before any of it lands on disk.
    for (const { data, stateFileName } of stateFiles) {
      if (data === undefined) {
        stateFileNames.delete(stateFileName);
        continue;
      }

      if (
        stateFileName.length > STATE_FILE_NAME_MAX_LENGTH ||
        !STATE_FILE_NAME_PATTERN.test(stateFileName) ||
        !STATE_FILE_EXTENSIONS.includes(extname(stateFileName))
      ) {
        throw new TransactionError(`State file name "${stateFileName}" is not accepted by the remote state!`);
      }
      if (data.length > MAXIMUM_STATE_FILE_SIZE_IN_BYTES) {
        throw new TransactionError(`State file "${stateFileName}" is larger than 5MB!`);
      }
      stateFileNames.add(stateFileName);
    }
    if (
      stateFileNames.size > MAXIMUM_STATE_FILES &&
      [...stateFileNames].some((stateFileName) => !existingStateFileNames.includes(stateFileName))
    ) {
      throw new TransactionError(`State cannot hold more than ${MAXIMUM_STATE_FILES} files!`);
    }

    // Write the directory, then the run's record once.
    for (const { data, stateFileName } of stateFiles) {
      if (data === undefined) {
        await rm(join(this.localStateDirectoryPath, stateFileName), { force: true });
      } else {
        await this.writeStateFile(stateFileName, data);
      }
    }
    await this.pushRun();
  }

  /**
   * Seals the run's record and releases the app lock. Unlocking an app that is not locked is not an
   * error.
   *
   * Taken or resumed in this state directory, the lock seals what the directory holds. Otherwise it
   * seals the record as it stands.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is held.
   */
  async unlockApp(lockId: string): Promise<void> {
    await this.withUploadLock(async () => {
      const lockFile = await this.readLockFile();
      const run = lockFile.run?.lockId === lockId ? lockFile.run : undefined;

      // Write the last of the run before its record is sealed.
      if (run) {
        run.stateFiles = await this.writeRunState(run);
        await this.writeLockFile(lockFile);
      }

      const released = await this.releaseAppLock(lockId);
      if (!released && (await this.readAppLocks()).length > 0) {
        throw new TransactionError('Invalid lock ID!');
      }

      // Drop the lock file of the run this directory belonged to.
      if (run) {
        await this.deleteLockFile();
      }
    });
  }

  /**
   * The route this app's state and locks are read and written at.
   */
  private appStateUrl(): string {
    return `${this.stateManagementServiceUrl}/organization/${this.organizationId}/app/${this.appId}`;
  }

  /**
   * The session this run acts as. Every route but the health check is behind it.
   */
  private authorizationHeader(): { Authorization: string } {
    return { Authorization: `Bearer ${this.sessionId}` };
  }

  /**
   * Deletes the lock file. Deleting one that is not there is not an error.
   */
  private async deleteLockFile(): Promise<void> {
    await rm(join(this.localStateDirectoryPath, LOCK_FILE_NAME), { force: true });
  }

  /**
   * Writes the directory into the run's record, when this directory belongs to an open run.
   */
  private async pushRun(): Promise<void> {
    if (!(await this.readLockFile()).run) {
      return;
    }

    await this.withUploadLock(async () => {
      const lockFile = await this.readLockFile();
      if (lockFile.run) {
        lockFile.run.stateFiles = await this.writeRunState(lockFile.run);
        await this.writeLockFile(lockFile);
      }
    });
  }

  /**
   * Every lock the backend holds on this app, oldest first.
   */
  private async readAppLocks(): Promise<RemoteAppLock[]> {
    const response = await HttpUtility.send(`${this.appStateUrl()}/locks`, { headers: this.authorizationHeader() });
    if (!response.ok) {
      throw new TransactionError(`Failed to read the app lock: ${await HttpUtility.readErrorMessage(response)}`);
    }

    return ((await response.json()) as { locks: RemoteAppLock[] }).locks;
  }

  /**
   * The lock file. Empty when there is none.
   */
  private async readLockFile(): Promise<RemoteStateLockFile> {
    try {
      return JSON.parse(await readFile(join(this.localStateDirectoryPath, LOCK_FILE_NAME), 'utf-8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  /**
   * The newest record the app holds, sealed or not, or `undefined` when it holds none.
   *
   * One run holds the whole app at a time, so records are opened in the order they are sealed.
   */
  private async readNewestState(): Promise<RemoteState | undefined> {
    const response = await HttpUtility.send(`${this.appStateUrl()}?limit=1`, { headers: this.authorizationHeader() });
    if (!response.ok) {
      throw new TransactionError(`Failed to read the app state: ${await HttpUtility.readErrorMessage(response)}`);
    }

    return ((await response.json()) as { states: RemoteState[] }).states[0];
  }

  /**
   * Releases a lock, sealing the record its commit names. False when the lock is not held.
   */
  private async releaseAppLock(lockId: string): Promise<boolean> {
    const response = await HttpUtility.send(`${this.appStateUrl()}/lock/${lockId}/unlock`, {
      headers: this.authorizationHeader(),
      method: 'POST',
    });
    if (response.ok) {
      return true;
    }
    if (response.status === 404) {
      return false;
    }

    throw new TransactionError(`Failed to unlock the app: ${await HttpUtility.readErrorMessage(response)}`);
  }

  /**
   * Replaces every state file in the directory with the ones a multi-part state body carries, and
   * returns the record it describes.
   */
  private async replaceStateFiles(response: Response): Promise<{ state: RemoteState }> {
    const formData = await response.formData();
    const statePart = formData.get('state')!;
    const state = JSON.parse(typeof statePart === 'string' ? statePart : await statePart.text()) as RemoteState;

    // Take the state the backend holds over whatever the directory held, file for file.
    for (const stateFileName of await this.stateFileNames()) {
      await rm(join(this.localStateDirectoryPath, stateFileName), { force: true });
    }
    for (const stateFile of formData.getAll('stateFiles') as File[]) {
      await this.writeStateFile(stateFile.name, Buffer.from(await stateFile.arrayBuffer()));
    }

    return { state };
  }

  /**
   * Resumes the run holding `lockId` in this state directory.
   */
  private async resumeAppLock(lockId: string): Promise<{ lockId: string }> {
    return this.withUploadLock(async () => {
      const lock = (await this.readAppLocks()).find((l) => l.lockId === lockId);
      if (!lock) {
        throw new TransactionError(`App is not locked with lock ID "${lockId}"!`);
      }
      const lockFile = await this.readLockFile();

      // Continue in the directory the run was taken in, which holds everything it wrote.
      if (lockFile.run?.lockId === lockId) {
        lockFile.run.stateFiles = await this.writeRunState(lockFile.run);
        await this.writeLockFile(lockFile);
        return { lockId };
      }

      // Read what the run wrote so far. A run that wrote nothing started from the newest sealed state.
      let response = await HttpUtility.send(`${this.appStateUrl()}/commit/${lock.commitId}/files`, {
        headers: this.authorizationHeader(),
      });
      if (response.status === 404) {
        response = await HttpUtility.send(`${this.appStateUrl()}/latest`, { headers: this.authorizationHeader() });
      }
      if (!response.ok && response.status !== 404) {
        throw new TransactionError(`Failed to read the app state: ${await HttpUtility.readErrorMessage(response)}`);
      }

      const run = { commitId: lock.commitId, lockId, stateFiles: {} as { [stateFileName: string]: string } };
      if (response.ok) {
        const { state } = await this.replaceStateFiles(response);
        if (state.commitId === lock.commitId) {
          for (const stateFile of state.stateFiles) {
            run.stateFiles[stateFile.filename] = stateFile.md5;
          }
        }
      }
      run.stateFiles = await this.writeRunState(run);
      await this.writeLockFile({ refreshedCommitId: lockFile.refreshedCommitId, run });

      return { lockId };
    });
  }

  /**
   * Every state file the directory holds, which is every file in it but the provider's two lock
   * files and a write still in progress, and none of the directories a run writes beside them - a
   * report directory, or a generated terragrunt folder.
   */
  private async stateFileNames(): Promise<string[]> {
    try {
      return (await readdir(this.localStateDirectoryPath, { withFileTypes: true }))
        .filter(
          (entry) =>
            entry.isFile() &&
            !entry.name.startsWith('.') &&
            entry.name !== LOCK_FILE_NAME &&
            entry.name !== UPLOAD_LOCK_FILE_NAME,
        )
        .map((entry) => entry.name);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Runs `body` while holding `remote-state-upload.lock`, so one write to the backend is in flight at
   * a time across every octo process on this machine. The file is deleted when `body` returns, and
   * one left by a process that is gone is taken over.
   */
  private async withUploadLock<T>(body: () => Promise<T>): Promise<T> {
    await FileUtility.ensureDirectory(this.localStateDirectoryPath);
    const uploadLockFilePath = join(this.localStateDirectoryPath, UPLOAD_LOCK_FILE_NAME);

    // Take the upload lock, waiting on a live holder.
    while (true) {
      try {
        await writeFile(uploadLockFilePath, String(process.pid), { flag: 'wx' });
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
      }

      const holderProcessId = Number(await readFile(uploadLockFilePath, 'utf-8').catch(() => ''));
      let isHolderAlive = !holderProcessId;
      if (holderProcessId) {
        try {
          process.kill(holderProcessId, 0);
          isHolderAlive = true;
        } catch (error) {
          isHolderAlive = error.code === 'EPERM';
        }
      }

      if (isHolderAlive) {
        await new Promise((resolveTimeout) => setTimeout(resolveTimeout, UPLOAD_LOCK_RETRY_IN_MS));
      } else {
        await rm(uploadLockFilePath, { force: true });
      }
    }

    try {
      return await body();
    } finally {
      await rm(uploadLockFilePath, { force: true });
    }
  }

  /**
   * Writes the lock file.
   */
  private async writeLockFile(lockFile: RemoteStateLockFile): Promise<void> {
    await this.writeStateFile(LOCK_FILE_NAME, Buffer.from(JSON.stringify(lockFile, null, 2)));
  }

  /**
   * Writes the directory into the run's record as it stands, uploading only the files whose digest
   * the record does not already hold, and returns the digests the record holds afterwards.
   *
   * A directory holding nothing writes nothing, since the backend holds no empty state.
   */
  private async writeRunState(run: NonNullable<RemoteStateLockFile['run']>): Promise<{ [name: string]: string }> {
    const stateFileNames = await this.stateFileNames();
    if (stateFileNames.length === 0) {
      return run.stateFiles;
    }

    // Find what changed since the record was last written.
    const changedStateFiles: { data: Buffer; stateFileName: string }[] = [];
    for (const stateFileName of stateFileNames) {
      const data = await readFile(join(this.localStateDirectoryPath, stateFileName));
      if (run.stateFiles[stateFileName] !== createHash('md5').update(data).digest('hex')) {
        changedStateFiles.push({ data, stateFileName });
      }
    }
    if (changedStateFiles.length === 0 && stateFileNames.length === Object.keys(run.stateFiles).length) {
      return run.stateFiles;
    }

    // Write the complete list of names, and the files that changed.
    const body = new FormData();
    body.append('lockId', run.lockId);
    body.append('stateFileNames', stateFileNames.join(','));
    for (const { data, stateFileName } of changedStateFiles) {
      const bytes = new Uint8Array(data);
      body.append('stateFiles', new Blob([bytes], { type: STATE_FILE_CONTENT_TYPE }), stateFileName);
    }

    const response = await HttpUtility.send(this.appStateUrl(), {
      body,
      headers: this.authorizationHeader(),
      method: 'PUT',
    });
    if (response.status === 404) {
      throw new TransactionError(`App is not locked with lock ID "${run.lockId}"!`);
    }
    // Upload everything when the record does not hold a file the digests say it does.
    if (response.status === 400 && Object.keys(run.stateFiles).length > 0) {
      return this.writeRunState({ ...run, stateFiles: {} });
    }
    if (!response.ok) {
      throw new TransactionError(`Failed to write the app state: ${await HttpUtility.readErrorMessage(response)}`);
    }

    const state = (await response.json()) as RemoteState;
    return Object.fromEntries(state.stateFiles.map((stateFile) => [stateFile.filename, stateFile.md5]));
  }

  /**
   * Writes one file into the state directory whole, so a process reading it never reads half of it.
   */
  private async writeStateFile(stateFileName: string, data: Buffer): Promise<void> {
    await FileUtility.ensureDirectory(this.localStateDirectoryPath);

    const temporaryFilePath = join(this.localStateDirectoryPath, `.${stateFileName}.${process.pid}.tmp`);
    await writeFile(temporaryFilePath, data);
    await rename(temporaryFilePath, join(this.localStateDirectoryPath, stateFileName));
  }
}
