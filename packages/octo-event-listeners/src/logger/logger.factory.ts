import { PinoTransport } from '@loglayer/transport-pino';
import { LogLayer } from 'loglayer';
import { type LevelWithSilentOrString, pino } from 'pino';

/**
 * How {@link LoggingEventListener} writes. It always writes to stderr, so stdout carries only a
 * command's own output, such as the lock id `octo lock` prints or the JSON terraform reads from `octo run-action`.
 *
 * @group Event Listeners
 */
export interface LoggerOptions {
  /**
   * Whether to emit ANSI colors. Defaults to whether stderr is a terminal.
   */
  colorize?: boolean;

  /**
   * The minimum level to emit. See {@link LoggingEventListener} for what each level carries.
   *
   * @defaultValue `'info'`
   */
  level?: LevelWithSilentOrString;
}

/**
 * @internal
 */
export class Logger {
  private static sharedInstance: Logger | undefined;

  log!: LogLayer;

  private configuration = '';

  /**
   * @internal
   */
  constructor(options: LoggerOptions = {}) {
    this.configure(options);
  }

  /**
   * Drops the shared logger so the next {@link shared} call builds a new one. For tests, which boot
   * repeatedly in one process.
   */
  static resetShared(): void {
    this.sharedInstance = undefined;
  }

  /**
   * The one logger for the process.
   *
   * Everything that logs must share it. `pino-pretty` runs in a worker thread, so two Logger instances
   * are two workers writing to the same file descriptor with no ordering between them. One instance,
   * one stream, correct order.
   *
   * Options {@link configure} it; a call without options takes whatever is already running.
   */
  static shared(options?: LoggerOptions): Logger {
    if (!this.sharedInstance) {
      this.sharedInstance = new Logger(options);
    } else if (options) {
      this.sharedInstance.configure(options);
    }
    return this.sharedInstance;
  }

  /**
   * Re-points this logger, keeping its object identity so listeners holding a reference pick up the
   * new settings.
   *
   * Reconfiguring rather than replacing is required: `EventService` resolves a listener on its first
   * event, which is a no-argument factory call, and octo replays buffered registration events the
   * moment `@OnEvent` runs. So the shared logger is always built with defaults before boot options
   * exist. First-caller-wins would make `level` un-settable.
   */
  configure({ colorize = true, level = 'info' }: LoggerOptions = {}): void {
    // A new pino means a new pino-pretty worker, so only rebuild on a real change.
    const configuration = JSON.stringify({ colorize, level });
    if (configuration === this.configuration) {
      return;
    }
    this.configuration = configuration;

    this.log = new LogLayer({
      transport: new PinoTransport({
        logger: pino({
          level,
          transport: {
            options: {
              colorize,
              // pino-pretty writes to fd 1 by default; 2 is stderr.
              destination: 2,
            },
            target: 'pino-pretty',
          },
        }),
      }),
    });
  }
}
