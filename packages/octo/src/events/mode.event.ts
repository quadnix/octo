import { Event } from './event.model.js';

/**
 * The steps of the octo lifecycle.
 *
 * @group Events/Mode
 */
export type OctoMode = 'commit' | 'generate' | 'run-action' | 'validate';

/**
 * What every {@link ModeEvent} carries.
 *
 * @group Events/Mode
 */
export interface ModeEventPayload {
  /**
   * Absent in `run-action`, which does not load an app.
   */
  appName?: string;

  /**
   * The mode this event is about.
   */
  mode: OctoMode;
}

/**
 * The ModeEvent class is the superclass for all events marking the boundaries of an octo lifecycle mode.
 *
 * @group Events/Mode
 */
export class ModeEvent<T extends ModeEventPayload = ModeEventPayload> extends Event<T> {}

/**
 * This event is emitted when a mode begins, before any work is done.
 *
 * @group Events/Mode
 */
export class ModeStartedEvent extends ModeEvent {}

/**
 * This event is emitted when a mode completes successfully.
 * A listener that returns a promise is awaited, so it can finish writing before the process exits.
 *
 * @group Events/Mode
 */
export class ModeFinishedEvent extends ModeEvent<ModeEventPayload & { durationInMs: number }> {}

/**
 * This event is emitted when a mode throws. The error is also re-thrown to the caller.
 * A listener that returns a promise is awaited, so it can finish writing before the process exits.
 *
 * @group Events/Mode
 */
export class ModeFailedEvent extends ModeEvent<ModeEventPayload & { durationInMs: number; error: string }> {}
