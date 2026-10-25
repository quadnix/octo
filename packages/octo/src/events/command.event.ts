import { Event } from './event.model.js';

/**
 * The superclass of the events marking one command a driver runs, such as one `octo` CLI command.
 * A command may run several modes, or none.
 *
 * @group Events/Command
 */
export class CommandEvent<T extends { command: string } = { command: string }> extends Event<T> {}

/**
 * This event is emitted when a command begins.
 *
 * @group Events/Command
 */
export class CommandStartedEvent extends CommandEvent {}

/**
 * This event is emitted when a command completes successfully. A listener that returns a promise is
 * awaited, so it can finish writing before the process exits.
 *
 * @group Events/Command
 */
export class CommandFinishedEvent extends CommandEvent<{ command: string; durationInMs: number }> {}

/**
 * This event is emitted when a command fails. A listener that returns a promise is awaited, so it
 * can finish writing before the process exits.
 *
 * @group Events/Command
 */
export class CommandFailedEvent extends CommandEvent<{ command: string; durationInMs: number; error: Error }> {}
