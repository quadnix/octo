import { jest } from '@jest/globals';
import { RetryUtility } from './retry.utility.js';

describe('Retry Utility UT', () => {
  describe('retryPromise', () => {
    it('should respect default options', async () => {
      const operation: jest.Mock<() => Promise<boolean>> = jest.fn();
      operation.mockRejectedValue(new Error('error!'));

      await expect(async () => {
        await RetryUtility.retryPromise(operation, {
          backOffFactor: 1,
          initialDelayInMs: 0,
          maxRetries: 1,
          retryDelayInMs: 10,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"error!"`);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should respect backOffFactor', async () => {
      const operation: jest.Mock<() => Promise<boolean>> = jest.fn();
      operation.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const startTime = Date.now();

      await expect(async () => {
        await RetryUtility.retryPromise(operation, {
          backOffFactor: 2,
          initialDelayInMs: 0,
          maxRetries: 1,
          retryDelayInMs: 10,
          throwOnError: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Exhausted all retries for the operation!"`);

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(30);
    });

    it('should respect initialDelayInMs', async () => {
      const operation: jest.Mock<() => Promise<boolean>> = jest.fn();
      operation.mockResolvedValueOnce(true);
      const startTime = Date.now();

      await RetryUtility.retryPromise(operation, {
        backOffFactor: 2,
        initialDelayInMs: 10,
        maxRetries: 1,
        retryDelayInMs: 10,
        throwOnError: true,
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(10);
    });

    it('should respect maxRetries', async () => {
      const operation: jest.Mock<() => Promise<boolean>> = jest.fn();
      operation.mockResolvedValue(false);

      await expect(async () => {
        await RetryUtility.retryPromise(operation, {
          backOffFactor: 1,
          initialDelayInMs: 0,
          maxRetries: 1,
          retryDelayInMs: 10,
          throwOnError: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Exhausted all retries for the operation!"`);

      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should respect retryDelayInMs', async () => {
      const operation: jest.Mock<() => Promise<boolean>> = jest.fn();
      operation.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const startTime = Date.now();

      await expect(async () => {
        await RetryUtility.retryPromise(operation, {
          backOffFactor: 2,
          initialDelayInMs: 0,
          maxRetries: 1,
          retryDelayInMs: 10,
          throwOnError: true,
        });
      }).rejects.toThrowErrorMatchingInlineSnapshot(`"Exhausted all retries for the operation!"`);

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(30);
    });

    it('should respect throwOnError', async () => {
      const operation: jest.Mock<() => Promise<boolean>> = jest.fn();
      operation.mockResolvedValue(false);
      const startTime = Date.now();

      await RetryUtility.retryPromise(operation, {
        backOffFactor: 1,
        initialDelayInMs: 0,
        maxRetries: 1,
        retryDelayInMs: 10,
        throwOnError: false,
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(20);
    });
  });
});
