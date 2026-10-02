import { ExecutionSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsLambdaExecutionSchema extends ExecutionSchema {
  @Validate({ options: { minLength: 1 } })
  executionId = Schema<string>();
}
