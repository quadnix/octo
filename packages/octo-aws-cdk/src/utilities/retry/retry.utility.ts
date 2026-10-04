interface IRetryOptions {
  backOffFactor?: number;
  initialDelayInMs?: number;
  maxRetries?: number;
  retryDelayInMs?: number;
  throwOnError?: boolean;
}

/**
 * @internal
 */
export class RetryUtility {
  private static readonly DEFAULT_BACK_OFF_FACTOR = 1;
  private static readonly DEFAULT_INITIAL_DELAY_IN_MS = 10000;
  private static readonly DEFAULT_MAX_RETRIES = 3;
  private static readonly DEFAULT_RETRY_DELAY_IN_MS = 10000;
  private static readonly DEFAULT_THROW_ON_ERROR = true;

  /**
   * @internal
   */
  static async retryPromise(
    operation: () => Promise<boolean>,
    {
      backOffFactor = RetryUtility.DEFAULT_BACK_OFF_FACTOR,
      initialDelayInMs = RetryUtility.DEFAULT_INITIAL_DELAY_IN_MS,
      maxRetries = RetryUtility.DEFAULT_MAX_RETRIES,
      retryDelayInMs = RetryUtility.DEFAULT_RETRY_DELAY_IN_MS,
      throwOnError = RetryUtility.DEFAULT_THROW_ON_ERROR,
    }: IRetryOptions = {},
  ): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, initialDelayInMs));

    do {
      try {
        const isConditionSatisfied = await operation();
        if (isConditionSatisfied) {
          return;
        }

        maxRetries! -= 1;
        retryDelayInMs! *= backOffFactor!;
      } catch (error) {
        if (throwOnError) {
          throw error;
        }
      } finally {
        await new Promise((resolve) => setTimeout(resolve, retryDelayInMs));
      }
    } while (maxRetries! >= 0);

    throw new Error('Exhausted all retries for the operation!');
  }
}
