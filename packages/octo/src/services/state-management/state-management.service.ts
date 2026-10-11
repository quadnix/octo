import { createHash } from 'node:crypto';
import type {
  ModelSerializedOutput,
  ResourceSerializedOutput,
  TerraformFolderOutput,
  TerraformResourceOutput,
} from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { AppLockError, TransactionError } from '../../errors/index.js';
import {
  AppLockRefusedEvent,
  AppLockTakenEvent,
  AppUnlockedEvent,
  AppUnlockingEvent,
  StateFilesSavedEvent,
  StateFilesSavingEvent,
  StateRefreshedEvent,
} from '../../events/index.js';
import { EventService } from '../event/event.service.js';
import {
  type IStateProvider,
  JOURNAL_COMMANDS_BEFORE_LOCK,
  JOURNAL_STATE_FILE_NAME_PREFIX,
} from './state-provider.interface.js';

/**
 * The `userData` persisted alongside the model graph in `models.json`.
 */
interface ModelStateUserData {
  terraformFolders?: TerraformFolderOutput[];
  version?: number;
}

/**
 * The `userData` persisted alongside the resource graph in `resources-actual.json` /
 * `resources-old.json`.
 */
interface ResourceStateUserData {
  terraformFolders?: TerraformFolderOutput[];
  terraformResources?: TerraformResourceOutput[];
  version?: number;
}

/**
 * What an external resource's action made of it, recorded the moment the action succeeded: the
 * inputs it was given, the properties it was asked for, and the response it produced.
 *
 * It exists only between that moment and the `commit` that folds it into the resource graph, and
 * while it exists it is the truth about that resource - octo state has not caught up yet.
 */
interface ExternalResourceState {
  inputs: Record<string, unknown>;
  properties: Record<string, unknown>;
  response: Record<string, string>;
}

/**
 * Serializes one state file.
 *
 * Formatted rather than written as a single line, because these files are committed: a reviewer
 * reading the pull request that produced them sees which entries moved, and a merge conflict lands
 * on the entries that actually collide instead of on the whole file.
 */
function serializeState(
  data: ModelSerializedOutput | ResourceSerializedOutput,
  userData: ModelStateUserData | ResourceStateUserData,
): Buffer {
  return Buffer.from(JSON.stringify({ data, userData }, null, 2));
}

/**
 * Reads and writes Octo's state files through the configured {@link IStateProvider}.
 *
 * Resolve it from the {@link Container} when you need to inspect what the last run recorded.
 * Octo manages its own state files, so writing through this service is rarely the right move.
 *
 * @group Services/State Management
 */
export class StateManagementService {
  /**
   * The resource graph as it stands after the last commit.
   */
  readonly actualResourceStateFileName: string = 'resources-actual.json';

  /**
   * The prefix of each record an external resource's action writes, until `commit` folds it into
   * the resource graph.
   */
  readonly externalResourceStateFileNamePrefix: string = 'resource-state-';

  /**
   * The model graph as it stands after the last commit.
   */
  readonly modelStateFileName: string = 'models.json';

  /**
   * The resource graph as intent described it on the last commit.
   */
  readonly oldResourceStateFileName: string = 'resources-old.json';

  private readonly stateProvider: IStateProvider;

  /**
   * @param stateProvider Where state is read from and written to.
   */
  constructor(stateProvider: IStateProvider) {
    this.stateProvider = stateProvider;
  }

  /**
   * Clears what an external resource's action recorded.
   *
   * @internal
   */
  async deleteExternalResourceState(resourceId: string): Promise<void> {
    await this.saveStates([{ data: undefined, stateFileName: this.externalResourceStateFileName(resourceId) }]);
  }

  /**
   * The id of the lock currently held, or `undefined` when the app is unlocked.
   */
  async getAppLock(): Promise<string | undefined> {
    return this.stateProvider.getAppLock();
  }

  /**
   * What an external resource's action made of it, if `commit` has not folded that into the resource
   * graph yet. Undefined once it has, or before the action has ever run.
   *
   * @internal
   */
  async getExternalResourceState(resourceId: string): Promise<ExternalResourceState | undefined> {
    const recordedState = await this.getState(this.externalResourceStateFileName(resourceId), Buffer.from(''));
    return recordedState.length > 0 ? JSON.parse(recordedState.toString()) : undefined;
  }

  /**
   * Reads the model graph. Returns an empty graph when no state exists yet.
   */
  async getModelState(
    stateFileName: string,
    { freeze = true }: { freeze?: boolean } = {},
  ): Promise<{ data: ModelSerializedOutput; userData: ModelStateUserData }> {
    const defaultValue: { data: ModelSerializedOutput; userData: ModelStateUserData } = {
      data: {
        anchors: [],
        dependencies: [],
        models: {},
        overlays: [],
      },
      userData: {},
    };

    try {
      const modelState = await this.getState(stateFileName);
      return JSON.parse(modelState.toString(), (_k, v) => (v && freeze ? Object.freeze(v) : v));
    } catch (error) {
      if (error.message === 'No state found!') {
        return defaultValue;
      } else {
        throw error;
      }
    }
  }

  /**
   * The response of one resource: what an external resource's action published and `commit` has not
   * recorded yet, falling back to what the last commit recorded. Undefined when neither holds it.
   *
   * @internal
   */
  async getResourceResponse(resourceId: string): Promise<Record<string, string> | undefined> {
    const recordedState = await this.getExternalResourceState(resourceId);
    if (recordedState) {
      return recordedState.response;
    }

    const { data } = await this.getResourceState(this.actualResourceStateFileName);
    const serializedResource = Object.values(data.resources).find((r) => r.resource.resourceId === resourceId);
    if (!serializedResource) {
      return undefined;
    }

    return Object.entries(serializedResource.resource.response).reduce(
      (accumulator, [key, value]) => {
        accumulator[key] = String(value);
        return accumulator;
      },
      {} as Record<string, string>,
    );
  }

  /**
   * Reads a resource graph. Returns an empty graph when no state exists yet.
   */
  async getResourceState(
    stateFileName: string,
    { freeze = true }: { freeze?: boolean } = {},
  ): Promise<{ data: ResourceSerializedOutput; userData: ResourceStateUserData }> {
    const defaultValue: { data: ResourceSerializedOutput; userData: ResourceStateUserData } = {
      data: {
        dependencies: [],
        resources: {},
      },
      userData: {},
    };

    try {
      const resourceState = await this.getState(stateFileName);
      return JSON.parse(resourceState.toString(), (_k, v) => (v && freeze ? Object.freeze(v) : v));
    } catch (error) {
      if (error.message === 'No state found!') {
        return defaultValue;
      } else {
        throw error;
      }
    }
  }

  /**
   * Reads a state file as-is.
   *
   * @param stateFileName The file's name in the state provider.
   * @param defaultValue Returned instead of throwing when the file does not exist.
   */
  async getState(stateFileName: string, defaultValue?: any): Promise<Buffer> {
    try {
      return await this.stateProvider.getState(stateFileName);
    } catch (error) {
      if (error.message === 'No state found!' && defaultValue) {
        return defaultValue;
      } else {
        throw error;
      }
    }
  }

  /**
   * Whether `lockId` is the lock currently held.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is held.
   */
  async isAppLocked(lockId: string): Promise<boolean> {
    return this.stateProvider.isAppLocked(lockId);
  }

  /**
   * The resource id of every external resource record a `commit` has not folded into the resource
   * graph yet.
   *
   * A record is written the moment an action succeeds and cleared by the commit that records it, so
   * one still here belongs to a run that did not finish.
   *
   * @internal
   */
  async listExternalResourceStateIds(): Promise<string[]> {
    const stateFileNames = await this.stateProvider.listStates(this.externalResourceStateFileNamePrefix);

    return stateFileNames
      .filter((stateFileName) => stateFileName.endsWith('.json'))
      .map((stateFileName) =>
        stateFileName.slice(this.externalResourceStateFileNamePrefix.length, -'.json'.length).replace(/\./g, '/'),
      );
  }

  /**
   * The names of the state files whose name starts with `prefix`. See {@link IStateProvider.listStates}.
   */
  async listStates(prefix: string): Promise<string[]> {
    return this.stateProvider.listStates(prefix);
  }

  /**
   * Takes the app lock and returns its id. With `lockId`, resumes the run already holding it.
   *
   * A new lock is refused while the state holds a journal file of any command but `generate`,
   * `validate` or `lock`: a cycle that finished without its journal being archived.
   *
   * @throws {@link AppLockError}
   * * When a lock is held, naming the id that holds it.
   * * When `lockId` is given and is not the lock held.
   * * When the state holds journal files of an unfinished cycle.
   */
  async lockApp(lockId?: string): ReturnType<IStateProvider['lockApp']> {
    const eventService = EventService.getInstance();

    let lock: Awaited<ReturnType<IStateProvider['lockApp']>>;
    try {
      // Refuse a new lock over journal files no lock owns.
      if (!lockId && !(await this.stateProvider.getAppLock())) {
        const unfinishedStateFileNames = (await this.stateProvider.listStates(JOURNAL_STATE_FILE_NAME_PREFIX)).filter(
          (stateFileName) => !JOURNAL_COMMANDS_BEFORE_LOCK.includes(stateFileName.split('.')[2]),
        );
        if (unfinishedStateFileNames.length > 0) {
          throw new AppLockError(
            `State holds the journal of a cycle that was never archived: ${unfinishedStateFileNames.join(', ')}! ` +
              'Move or delete these files, then lock again.',
            { reason: 'unfinished', stateFileNames: unfinishedStateFileNames },
          );
        }
      }

      lock = await this.stateProvider.lockApp(lockId);
    } catch (error) {
      if (error instanceof AppLockError) {
        await eventService.emitAndWait(
          new AppLockRefusedEvent(undefined, {
            holder: error.holder,
            newestCommitId: error.newestCommitId,
            reason: error.reason,
            refreshedCommitId: error.refreshedCommitId,
            stateFileNames: error.stateFileNames,
          }),
        );
      }
      throw error;
    }

    await eventService.emitAndWait(
      new AppLockTakenEvent(undefined, {
        commitId: lock.commitId,
        lockId: lock.lockId,
        resumed: !!lockId,
        resumedFrom: lock.resumedFrom,
      }),
    );
    return lock;
  }

  /**
   * Brings the state up to the newest a run may plan against. See {@link IStateProvider.refreshState}.
   */
  async refreshState(): Promise<Awaited<ReturnType<IStateProvider['refreshState']>>> {
    const refreshed = await this.stateProvider.refreshState();
    await EventService.getInstance().emitAndWait(new StateRefreshedEvent(undefined, refreshed));
    return refreshed;
  }

  /**
   * Records what an external resource's action made of it. The next run reads it back rather than
   * asking the resource graph, which does not learn any of this until `commit`.
   *
   * @internal
   */
  async saveExternalResourceState(resourceId: string, state: ExternalResourceState): Promise<void> {
    await this.saveStates([
      { data: Buffer.from(JSON.stringify(state)), stateFileName: this.externalResourceStateFileName(resourceId) },
    ]);
  }

  /**
   * @internal
   */
  async saveModelState(
    stateFileName: string,
    data: ModelSerializedOutput,
    userData: ModelStateUserData,
  ): Promise<void> {
    await this.saveStates([{ data: serializeState(data, userData), stateFileName }]);
  }

  /**
   * @internal
   */
  async saveResourceState(
    stateFileName: string,
    data: ResourceSerializedOutput,
    userData: ResourceStateUserData,
  ): Promise<void> {
    await this.saveStates([{ data: serializeState(data, userData), stateFileName }]);
  }

  /**
   * Writes state files as-is and as one change, deleting each one given no `data`. Listeners of
   * {@link StateFilesSavingEvent} may add files to the change first.
   */
  async saveStates(stateFiles: { data: Buffer | undefined; stateFileName: string }[]): Promise<void> {
    const eventService = EventService.getInstance();

    await eventService.emitAndWait(new StateFilesSavingEvent(undefined, { stateFiles }));
    await this.stateProvider.saveStates(stateFiles);

    eventService.emit(
      new StateFilesSavedEvent(undefined, {
        stateFiles: stateFiles.map(({ data, stateFileName }) => ({
          data,
          md5: data === undefined ? undefined : createHash('md5').update(data).digest('hex'),
          stateFileName,
        })),
      }),
    );
  }

  /**
   * Releases the app lock, then archives the cycle's journal. Unlocking an app that is not locked is
   * not an error.
   *
   * In order: listeners of {@link AppUnlockingEvent} write the last of the cycle, and a failure there
   * keeps the lock held; the lock is released, which seals the cycle; every journal file moves to
   * `archives/<lockId>/`, a cleanup on this machine whose failure is reported on stderr rather than
   * thrown.
   *
   * @throws {@link TransactionError} With the message `Invalid lock ID!` when a different lock is held.
   */
  async unlockApp(lockId: string): Promise<void> {
    const eventService = EventService.getInstance();

    await eventService.emitAndWait(new AppUnlockingEvent(undefined, { lockId }));

    // Stop when no lock is held, and refuse to touch the journal of another.
    const heldLockId = await this.stateProvider.getAppLock();
    if (!heldLockId) {
      return;
    }
    if (heldLockId !== lockId) {
      throw new TransactionError('Invalid lock ID!');
    }

    await this.stateProvider.unlockApp(lockId);

    // Archive the cycle's journal, names unchanged.
    try {
      const stateFiles: Parameters<StateManagementService['saveStates']>[0] = [];
      for (const stateFileName of await this.stateProvider.listStates(JOURNAL_STATE_FILE_NAME_PREFIX)) {
        stateFiles.push(
          {
            data: await this.stateProvider.getState(stateFileName),
            stateFileName: `archives/${lockId}/${stateFileName}`,
          },
          { data: undefined, stateFileName },
        );
      }
      if (stateFiles.length > 0) {
        await this.saveStates(stateFiles);
      }
    } catch (error) {
      process.stderr.write(`Failed to archive the journal of lock "${lockId}": ${error?.message ?? String(error)}\n`);
    }

    await eventService.emitAndWait(new AppUnlockedEvent(undefined, { lockId }));
  }

  /**
   * @internal
   */
  private externalResourceStateFileName(resourceId: string): string {
    // A resource id is not a file name - it carries `/` where a resource is named after a path, and
    // a state file name is one thing in a directory, in an object store, and in a URL path segment.
    // A resource id holds no `.`, so the separator stands in for the slash and reads back as one.
    return `${this.externalResourceStateFileNamePrefix}${resourceId.replace(/\//g, '.')}.json`;
  }
}

/**
 * @internal
 */
@Factory<StateManagementService>(StateManagementService)
export class StateManagementServiceFactory {
  private static instance: StateManagementService;

  /**
   * @internal
   */
  static async create(stateProvider?: IStateProvider): Promise<StateManagementService> {
    if (!this.instance) {
      if (!stateProvider) {
        throw new TransactionError(
          `Failed to create instance of "${StateManagementService.name}" due to insufficient arguments!`,
        );
      } else {
        this.instance = new StateManagementService(stateProvider);
        return this.instance;
      }
    } else {
      if (!stateProvider) {
        return this.instance;
      } else {
        this.instance = new StateManagementService(stateProvider);
        return this.instance;
      }
    }
  }
}
