import { Event } from './event.model.js';

/**
 * The superclass of the events about Octo's state: what was written, refreshed, locked, or unlocked.
 *
 * @group Events/State
 */
export class StateEvent<T> extends Event<T> {}

/**
 * This event is emitted when the app lock is refused, before the error is thrown. `holder` is the
 * command holding the lock, as far as the state provider knows it.
 *
 * @group Events/State
 */
export class AppLockRefusedEvent extends StateEvent<{
  holder?: { commitId?: string; context?: string; lockId: string; takenAt?: number };
  newestCommitId?: string;
  reason: 'held' | 'not-held' | 'state-moved' | 'unfinished';
  refreshedCommitId?: string;
  stateFileNames?: string[];
}> {}

/**
 * This event is emitted when the app lock is taken, or resumed with its id. A provider sharing state
 * names where a resume took the state directory from: the directory the lock was taken in
 * (`directory`), what the run uploaded so far (`run`), or the newest sealed state, because the run
 * uploaded nothing (`sealed`).
 *
 * @group Events/State
 */
export class AppLockTakenEvent extends StateEvent<{
  commitId?: string;
  lockId: string;
  resumed: boolean;
  resumedFrom?: 'directory' | 'run' | 'sealed';
}> {}

/**
 * This event is emitted after the app lock is released. The cycle's journal files are archived, and
 * with a remote state provider its record is sealed, by then. Nothing is written after it.
 *
 * @group Events/State
 */
export class AppUnlockedEvent extends StateEvent<{ lockId: string }> {}

/**
 * This event is emitted before the app lock is released. A listener that returns a promise is
 * awaited, so what it writes lands in the cycle's record before the record is sealed. A listener that
 * fails keeps the lock held.
 *
 * @group Events/State
 */
export class AppUnlockingEvent extends StateEvent<{ lockId: string }> {}

/**
 * This event is emitted after state files are written, with the bytes written and their MD5. A
 * deleted file has neither.
 *
 * @group Events/State
 */
export class StateFilesSavedEvent extends StateEvent<{
  stateFiles: { data: Buffer | undefined; md5: string | undefined; stateFileName: string }[];
}> {}

/**
 * This event is emitted before state files are written. A listener that returns a promise is awaited,
 * and may add files to `stateFiles`, which are then written in the same change.
 *
 * @group Events/State
 */
export class StateFilesSavingEvent extends StateEvent<{
  stateFiles: { data: Buffer | undefined; stateFileName: string }[];
}> {}

/**
 * This event is emitted after the state is brought up to the newest a command may plan against.
 * `replaced` is true when the state files were replaced with the ones of another commit.
 *
 * @group Events/State
 */
export class StateRefreshedEvent extends StateEvent<{
  commitId?: string;
  previousCommitId?: string;
  replaced: boolean;
}> {}
