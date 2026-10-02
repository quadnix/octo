import { BaseAnchorSchema, type Execution, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with an {@link Execution} model representing code running on AWS Lambda.
 *
 * @group Anchors/AwsLambdaExecution
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsLambdaExecutionAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Execution;

  /**
   * Input properties.
   * * `properties.environmentVariables` - The environment variables passed to this {@link Execution}.
   * * `properties.functionName` - The name of the Lambda function.
   * * `properties.invokerAccountIds` - The AWS accounts allowed to call the function's URL.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsLambdaExecutionAnchorSchema['properties']): string[] => [value.functionName],
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsLambdaExecutionAnchorSchema['properties']): string[] =>
        Object.keys(value.environmentVariables),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: AwsLambdaExecutionAnchorSchema['properties']): string[] =>
        Object.values(value.environmentVariables),
      options: { regex: /^.+$/ },
    },
    {
      destruct: (value: AwsLambdaExecutionAnchorSchema['properties']): string[] => value.invokerAccountIds,
      options: { regex: /^\d{12}$/ },
    },
  ])
  override properties = Schema<{
    environmentVariables: Record<string, string>;
    functionName: string;
    invokerAccountIds: string[];
  }>();
}
