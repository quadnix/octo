import { JournalUtility } from './journal.utility.js';

describe('JournalUtility UT', () => {
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
