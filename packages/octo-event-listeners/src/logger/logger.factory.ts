import { Factory } from '@quadnix/octo';
import { pino } from 'pino';
import { LogLayer } from 'loglayer';
import { PinoTransport } from '@loglayer/transport-pino';

export class OctoEventLogger {
  readonly log: LogLayer;

  constructor(logLayer: LogLayer) {
    this.log = logLayer;
  }
}

@Factory<OctoEventLogger>(OctoEventLogger)
export class OctoEventLoggerFactory {
  private static instance: OctoEventLogger;

  static async create(): Promise<OctoEventLogger> {
    if (!this.instance) {
      const logLayer = new LogLayer({
        transport: new PinoTransport({
          logger: pino({
            level: 'trace',
            timestamp: false,
            transport: { options: { colorize: true }, target: 'pino-pretty' },
          }),
        }),
      });
      this.instance = new OctoEventLogger(logLayer);
    }
    return this.instance;
  }
}
