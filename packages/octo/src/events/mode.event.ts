import { Event } from './event.model.js';

export type OctoMode = 'commit' | 'generate' | 'run-action' | 'validate';

export interface ModeEventPayload {
  /**
   * Absent in `run-action`, which does not load an app.
   */
  appName?: string;

  mode: OctoMode;
}

/**
 * The ModeEvent class is the superclass for all events marking the boundaries of an octo lifecycle mode.
 *
 * @group Events/Mode
 *
 * @returns The Event instance.
 */
export class ModeEvent<T extends ModeEventPayload = ModeEventPayload> extends Event<T> {}

/**
 * This event is emitted when a mode begins, before any work is done.
 *
 * @group Events/Mode
 *
 * @returns The Event instance.
 */
export class ModeStartedEvent extends ModeEvent {}

/**
 * This event is emitted when a mode completes successfully.
 * Emitted with {@link EventService.emitAndWait}.
 *
 * @group Events/Mode
 *
 * @returns The Event instance.
 */
export class ModeFinishedEvent extends ModeEvent<ModeEventPayload & { durationInMs: number }> {}

/**
 * This event is emitted when a mode throws. The error is also re-thrown to the caller.
 * Emitted with {@link EventService.emitAndWait}.
 *
 * @group Events/Mode
 *
 * @returns The Event instance.
 */
export class ModeFailedEvent extends ModeEvent<ModeEventPayload & { durationInMs: number; error: string }> {}
