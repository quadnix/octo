import { PinoTransport } from '@loglayer/transport-pino';
import { LogLayer } from 'loglayer';
import { type LevelWithSilentOrString, pino } from 'pino';

export class Logger {
  readonly log: LogLayer;

  constructor({ colorize = true, level = 'trace' }: { colorize?: boolean; level?: LevelWithSilentOrString } = {}) {
    this.log = new LogLayer({
      transport: new PinoTransport({
        logger: pino({
          level,
          timestamp: false,
          transport: { options: { colorize }, target: 'pino-pretty' },
        }),
      }),
    });
  }
}
