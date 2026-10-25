import * as octo from '@quadnix/octo';
import { AppLockError, ModuleError, TerraformCommandError } from '@quadnix/octo';
import { JournalUtility } from './journal.utility.js';

describe('JournalUtility UT', () => {
  describe('EVENT_CLASSES', () => {
    it('should name every event octo emits that is not deliberately left out', () => {
      const leftOut = [
        // Abstract superclasses.
        'CommandEvent',
        'CommitHookEvent',
        'Event',
        'HookEvent',
        'ModeEvent',
        'ModeResultEvent',
        'ModelActionHookEvent',
        'ResourceActionHookEvent',
        'StateEvent',
        'TerraformEvent',
        'TransactionEvent',
        // Emitted after the journal is written for the last time.
        'AppUnlockedEvent',
        // Recorded in the terraform log instead.
        'TerraformProcessOutputEvent',
        // Carries the journal's own files.
        'StateFilesSavingEvent',
      ];
      const eventClassNames = Object.entries(octo)
        .filter(
          ([, value]) => typeof value === 'function' && (value === octo.Event || value.prototype instanceof octo.Event),
        )
        .map(([name]) => name)
        .filter((name) => !/(Registration|Serialized|Deserialized|Serialization)Event$/.test(name));

      expect(eventClassNames.filter((name) => !leftOut.includes(name)).sort()).toEqual(
        Object.keys(JournalUtility.EVENT_CLASSES).sort(),
      );
    });
  });

  describe('ERROR_CLASSES', () => {
    it('should name every error class octo exports', () => {
      const errorClassNames = Object.entries(octo)
        .filter(([, value]) => typeof value === 'function' && value.prototype instanceof Error)
        .map(([name]) => name);

      expect(errorClassNames.sort()).toEqual(Object.keys(JournalUtility.ERROR_CLASSES).sort());
    });
  });

  describe('toPlain()', () => {
    it('should name a node by its context', () => {
      expect(JournalUtility.toPlain({ node: { getContext: () => 'app=a' } })).toEqual({ node: 'app=a' });
    });

    it('should give a diff its JSON, the actions chosen for it, and its apply order', () => {
      class AddAppModelAction {}
      const diffMetadata = {
        actions: [new AddAppModelAction()],
        applyOrder: 2,
        diff: {},
        toJSON: (): object => ({ action: 'add', field: 'name', node: 'app=a', value: 'a' }),
      };

      expect(JournalUtility.toPlain([diffMetadata])).toEqual([
        { action: 'add', actions: ['AddAppModelAction'], applyOrder: 2, field: 'name', node: 'app=a', value: 'a' },
      ]);
    });

    it('should record an octo error by its class name, its message and the fields its class names', () => {
      expect(JournalUtility.toPlain({ error: new ModuleError('Module failed!', 'AwsIniAccountModule') })).toEqual({
        error: { className: 'ModuleError', message: 'Module failed!', module: 'AwsIniAccountModule' },
      });
      expect(
        JournalUtility.toPlain(new AppLockError('App is locked!', { holder: { lockId: 'lock-1' }, reason: 'held' })),
      ).toEqual({ className: 'AppLockError', holder: { lockId: 'lock-1' }, message: 'App is locked!', reason: 'held' });
    });

    it('should leave out what the terraform log already holds of a failed terraform command', () => {
      const error = new TerraformCommandError('Failed to run "terraform plan"!', ['plan'], 1, 'out', 'err');

      expect(JournalUtility.toPlain(error)).toEqual({
        args: ['plan'],
        className: 'TerraformCommandError',
        exitCode: 1,
        message: 'Failed to run "terraform plan"!',
      });
    });

    it('should mark an object already on the path, and keep one seen twice elsewhere', () => {
      const shared = { a: 1 };
      const cyclic: Record<string, unknown> = { shared };
      cyclic.self = cyclic;

      expect(JournalUtility.toPlain({ cyclic, shared })).toEqual({
        cyclic: { self: '[Circular]', shared: { a: 1 } },
        shared: { a: 1 },
      });
    });

    it('should turn maps, sets, dates and errors into plain data, and drop bytes', () => {
      expect(
        JournalUtility.toPlain({
          bytes: Buffer.from('a'),
          // eslint-disable-next-line no-restricted-syntax
          date: new Date(0),
          error: new Error('bad'),
          map: new Map([['a', new Set([1])]]),
        }),
      ).toEqual({
        bytes: undefined,
        date: 0,
        error: { message: 'bad', name: 'Error' },
        map: { a: [1] },
      });
    });
  });
});
