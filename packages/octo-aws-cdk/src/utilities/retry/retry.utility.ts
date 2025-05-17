interface IRetryOptions {
  backOffFactor?: number;
  initialDelayInMs?: number;
  maxRetries?: number;
  retryDelayInMs?: number;
  throwOnError?: boolean;
}

export class RetryUtility {
  private static DEFAULT_BACK_OFF_FACTOR = 1;
  private static DEFAULT_INITIAL_DELAY_IN_MS = 10000;
  private static DEFAULT_MAX_RETRIES = 3;
  private static DEFAULT_RETRY_DELAY_IN_MS = 10000;
  private static DEFAULT_THROW_ON_ERROR = true;

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

        await new Promise((resolve) => setTimeout(resolve, retryDelayInMs));

        maxRetries! -= 1;
        retryDelayInMs! *= backOffFactor!;
      } catch (error) {
        if (throwOnError) {
          throw error;
        }
      }
    } while (maxRetries! >= 0);

    throw new Error('Exhausted all retries for the operation!');
  }

  static setDefaults(options: Partial<IRetryOptions>): void {
    if (options.backOffFactor !== undefined) {
      this.DEFAULT_BACK_OFF_FACTOR = options.backOffFactor;
    }
    if (options.initialDelayInMs !== undefined) {
      this.DEFAULT_INITIAL_DELAY_IN_MS = options.initialDelayInMs;
    }
    if (options.maxRetries !== undefined) {
      this.DEFAULT_MAX_RETRIES = options.maxRetries;
    }
    if (options.retryDelayInMs !== undefined) {
      this.DEFAULT_RETRY_DELAY_IN_MS = options.retryDelayInMs;
    }
    if (options.throwOnError !== undefined) {
      this.DEFAULT_THROW_ON_ERROR = options.throwOnError;
    }
  }
}
