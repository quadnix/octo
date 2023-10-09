export class RetryUtility {
  static async retryPromise(
    operation: () => Promise<boolean>,
    options: {
      backOffFactor?: number;
      initialDelayInMs?: number;
      maxRetries?: number;
      retryDelayInMs?: number;
      throwOnError?: boolean;
    } = { backOffFactor: 1, initialDelayInMs: 10000, maxRetries: 3, retryDelayInMs: 10000, throwOnError: true },
  ): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, options.initialDelayInMs));

    do {
      try {
        const isConditionSatisfied = await operation();
        if (isConditionSatisfied) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, options.retryDelayInMs));

        options.maxRetries! -= 1;
        options.retryDelayInMs! *= options.backOffFactor!;
      } catch (error) {
        if (options.throwOnError) {
          throw error;
        }
      }
    } while (options.maxRetries! >= 0);
  }
}
