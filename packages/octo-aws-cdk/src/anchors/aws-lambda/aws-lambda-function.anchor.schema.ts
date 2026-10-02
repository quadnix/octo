import { type AOverlay, BaseAnchorSchema, type BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with the overlay that creates a Lambda function for an execution. A module
 * that serves the function, such as a CloudFront distribution, consumes it to find the function, and
 * to wait for the function to be created first.
 *
 * @group Anchors/AwsLambdaExecution
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsLambdaFunctionAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: AOverlay<BaseOverlaySchema, any>;

  /**
   * Input properties.
   * * `properties.functionName` - The name of the Lambda function.
   * * `properties.timeoutInSeconds` - How long one invocation may run before Lambda stops it.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsLambdaFunctionAnchorSchema['properties']): string[] => [value.functionName],
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsLambdaFunctionAnchorSchema['properties']): number[] => [value.timeoutInSeconds],
      options: { maxLength: 900, minLength: 1 },
    },
  ])
  override properties = Schema<{
    functionName: string;
    timeoutInSeconds: number;
  }>();
}
