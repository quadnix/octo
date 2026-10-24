import { TimestampUtility } from './timestamp.utility.js';

describe('TimestampUtility UT', () => {
  describe('formatTimestamp()', () => {
    it('should format the time as a date and a time of day, naming the time zone it is in', () => {
      expect(TimestampUtility.formatTimestamp(1_755_226_471_000)).toMatch(/^2025-08-1[45] \d{2}:\d{2}:31 \S+$/);
    });
  });
});
