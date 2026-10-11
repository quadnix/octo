import { Logger } from './logger.factory.js';

/**
 * Reaches the pino instance loglayer wraps, to assert the level actually landed rather than that we
 * merely passed it. Reads loglayer internals, so a loglayer upgrade may need this updated.
 */
function pinoLevelOf(logger: Logger): string {
  return (logger.log as unknown as { _config: { transport: { logger: { level: string } } } })._config.transport.logger
    .level;
}

describe('Logger UT', () => {
  beforeEach(() => {
    Logger.resetShared();
  });

  describe('shared()', () => {
    it('applies options to a logger that was already built without them', () => {
      // What EventService does on the first event dispatch, before octo.initialize() has run:
      // a no-argument factory call, which builds the logger with defaults.
      const early = Logger.shared();
      expect(pinoLevelOf(early)).toBe('info');

      // What octo.initialize() does with the definition's options.
      const configured = Logger.shared({ destination: 'stderr', level: 'debug' });

      expect(configured).toBe(early);
      expect(pinoLevelOf(configured)).toBe('debug');
      expect(pinoLevelOf(early)).toBe('debug');
    });

    it('keeps the running configuration when called without options', () => {
      Logger.shared({ level: 'debug' });

      expect(pinoLevelOf(Logger.shared())).toBe('debug');
    });

    it('does not rebuild when the options have not changed', () => {
      const logger = Logger.shared({ level: 'debug' });
      const log = logger.log;

      Logger.shared({ level: 'debug' });

      // A rebuild would start a second pino-pretty worker for no reason.
      expect(logger.log).toBe(log);
    });
  });
});
