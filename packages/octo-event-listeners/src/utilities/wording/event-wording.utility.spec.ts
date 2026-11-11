import { EventWordingUtility } from './event-wording.utility.js';

describe('EventWordingUtility UT', () => {
  describe('word()', () => {
    it('should word nothing for an event the terminal does not log', () => {
      expect(
        EventWordingUtility.word({ name: '', payload: { command: 'validate' }, type: 'CommandStartedEvent' }),
      ).toBeUndefined();
    });

    it('should word a hook as the terminal does, naming its subject when it has one', () => {
      expect(EventWordingUtility.word({ name: 'my-hook', type: 'PreModelActionHookCallbackDoneEvent' })).toEqual([
        { level: 'debug', metadata: { name: 'my-hook' }, text: 'PreModelAction hook callback executed.' },
      ]);
    });

    it('should name the terraform time a finished mode spent, from what the terminal knew', () => {
      const entry = {
        name: '',
        payload: { appName: 'shop', durationInMs: 20, mode: 'validate' as const },
        type: 'ModeFinishedEvent' as const,
      };

      expect(EventWordingUtility.word(entry)!.map((line) => line.text)).toEqual(['Finished "validate" in 20ms.']);
      expect(EventWordingUtility.word(entry, { terraformInMs: 31536 })!.map((line) => line.text)).toEqual([
        'Finished "validate" in 20ms, after 31536ms in terraform.',
      ]);
    });

    it('should say why a run-action did nothing', () => {
      expect(
        EventWordingUtility.word({
          name: '',
          payload: { action: 'noop', reason: 'already-done', resourceId: 'ecr-image-tag-1' },
          type: 'RunActionModeCompletedEvent',
        }),
      ).toEqual([
        {
          level: 'info',
          metadata: {
            action: 'noop',
            predecessorResourceId: undefined,
            reason: 'already-done',
            resourceId: 'ecr-image-tag-1',
          },
          text: 'Run-action "ecr-image-tag-1": nothing to do, its action already ran for these inputs.',
        },
      ]);
    });

    it('should word every line of a validate report the terminal logs', () => {
      const lines = EventWordingUtility.word({
        name: '',
        payload: {
          report: {
            attributedChanges: [],
            confidence: 'exact',
            dataLoss: [],
            drift: [{ address: 'aws_vpc.vpc-1', moduleId: 'region-module', tfActions: ['update'] }],
            failures: [],
            intentChanges: [],
            moves: [],
            notes: [{ message: 'Image is gone!', moduleId: 'tag-module' }],
            uncertain: [],
          },
        },
        type: 'ValidateModeCompletedEvent',
      });

      expect(lines!.map(({ level, text }) => `${level} ${text}`)).toEqual([
        'info Validate: 0 resource change(s), 0 terraform change(s), 1 drift (exact).',
        'warn 1 terraform change(s) are drift — nothing in intent explains them.',
        'debug Image is gone!',
      ]);
    });
  });
});
