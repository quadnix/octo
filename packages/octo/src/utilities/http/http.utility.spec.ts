import { createHash } from 'node:crypto';
import { jest } from '@jest/globals';
import { HttpUtility } from './http.utility.js';

describe('HttpUtility UT', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function sentHeaders(): Record<string, string> {
    return fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
  }

  describe('send()', () => {
    it('should send no hash on a GET', async () => {
      await HttpUtility.send('https://example.com/state');

      expect(sentHeaders()['x-amz-content-sha256']).toBeUndefined();
    });

    it('should send no hash with a streamed body', async () => {
      await HttpUtility.send('https://example.com/state', { body: new ReadableStream(), method: 'PUT' });

      expect(sentHeaders()['x-amz-content-sha256']).toBeUndefined();
    });

    it("should send an empty body's SHA-256 on a write without one", async () => {
      await HttpUtility.send('https://example.com/state/unlock', { method: 'POST' });

      expect(sentHeaders()['x-amz-content-sha256']).toBe(createHash('sha256').update('').digest('hex'));
    });

    it('should send the SHA-256 of the body sent', async () => {
      await HttpUtility.sendJson('https://example.com/state/lock', { body: { commitId: 'commit-1' }, method: 'POST' });

      expect(sentHeaders()['x-amz-content-sha256']).toBe(
        createHash('sha256').update('{"commitId":"commit-1"}').digest('hex'),
      );
    });
  });
});
