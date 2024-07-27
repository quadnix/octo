import { Factory } from '@quadnix/octo';
import * as Pino from 'pino';
import { LogLayer, LoggerType } from 'loglayer';

export class OctoEventLogger {
  readonly log: LogLayer<any>;

  constructor(logLayer: LogLayer<any>) {
    this.log = logLayer;
  }
}

@Factory<OctoEventLogger>(OctoEventLogger)
export class OctoEventLoggerFactory {
  private static instance: OctoEventLogger;

  static async create(): Promise<OctoEventLogger> {
    if (!this.instance) {
      const logLayer = new LogLayer<Pino.Logger>({
        logger: {
          instance: Pino.pino({ level: 'trace', timestamp: false }),
          type: LoggerType.PINO,
        },
      });
      this.instance = new OctoEventLogger(logLayer);
    }
    return this.instance;
  }
}
