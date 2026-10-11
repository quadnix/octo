import { jest } from '@jest/globals';
import { CommandFailedEvent, CommandFinishedEvent, CommandStartedEvent, Container, type Event } from '@quadnix/octo';

import { OctoUtility } from './octo.utility.js';

describe('OctoUtility UT', () => {
  describe('runCommand()', () => {
    let emitted: Event<unknown>[];
    let processExitSpy: jest.SpiedFunction<typeof process.exit>;

    beforeEach(async () => {
      emitted = [];
      const eventService = (await Container.getInstance().get('EventService')) as {
        emit(event: Event<unknown>): void;
        emitAndWait(event: Event<unknown>): Promise<void>;
      };
      jest.spyOn(eventService, 'emit').mockImplementation((event) => {
        emitted.push(event);
      });
      jest.spyOn(eventService, 'emitAndWait').mockImplementation(async (event) => {
        emitted.push(event);
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});
      processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should announce the failure, report it, and exit with 1 when the command throws', async () => {
      await OctoUtility.runCommand('lock', async () => {
        throw new Error('App already locked!');
      });

      expect(emitted.map((e) => e.constructor)).toEqual([CommandStartedEvent, CommandFailedEvent]);
      expect(emitted[1].payload).toMatchObject({ command: 'lock', error: 'App already locked!' });
      expect(console.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should announce the failure and exit with the code the command returns', async () => {
      await OctoUtility.runCommand('validate', async () => 1);

      expect(emitted.map((e) => e.constructor)).toEqual([CommandStartedEvent, CommandFailedEvent]);
      expect(emitted[1].payload).toMatchObject({ command: 'validate', error: 'Exited with code 1.' });
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should announce the command and its end', async () => {
      await OctoUtility.runCommand('generate', async () => undefined);

      expect(emitted.map((e) => e.constructor)).toEqual([CommandStartedEvent, CommandFinishedEvent]);
      expect(emitted[0].payload).toEqual({ command: 'generate' });
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });
});
