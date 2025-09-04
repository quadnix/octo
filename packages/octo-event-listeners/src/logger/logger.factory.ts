import { PinoTransport } from '@loglayer/transport-pino';
import { LogLayer } from 'loglayer';
import { pino } from 'pino';

export class Logger {
  readonly log: LogLayer;

  constructor() {
    this.log = new LogLayer({
      transport: new PinoTransport({
        logger: pino({
          level: 'trace',
          timestamp: false,
          transport: { options: { colorize: true }, target: 'pino-pretty' },
        }),
      }),
    });
  }
}
