interface IRetryOptions {
  backOffFactor?: number;
  initialDelayInMs?: number;
  maxRetries?: number;
  retryDelayInMs?: number;
  throwOnError?: boolean;
}

export class RetryUtility {
  static async retryPromise(
    operation: () => Promise<boolean>,
    {
      backOffFactor = 1,
      initialDelayInMs = 10000,
      maxRetries = 3,
      retryDelayInMs = 10000,
      throwOnError = true,
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

    if (throwOnError) {
      throw new Error('Exhausted all retries for the operation!');
    }
  }
}
