import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `CloudFrontFunctionSchema` class is the schema for the `CloudFrontFunction` resource, which
 * represents one CloudFront Function: JavaScript a distribution runs at the edge on a viewer request
 * or response. Terraform provisions it, published, as
 * [`aws_cloudfront_function`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_function).
 *
 * @group Resources/CloudFrontFunction
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has no parents. Each distribution running it is its child.
 * ```mermaid
 * graph TD;
 *   cloudfront_function((CloudFront<br>Function)) --> cloudfront_distribution((CloudFront<br>Distribution))
 * ```
 * @overrideProperty resourceId - The resource id is of format `cloudfront-function-<name>`.
 */
export class CloudFrontFunctionSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account of the function.
   * * `properties.code` - The function's JavaScript, on the `cloudfront-js-2.0` runtime.
   * * `properties.name` - The name of the function, unique in its account.
   */
  @Validate([
    {
      destruct: (value: CloudFrontFunctionSchema['properties']): string[] => [value.awsAccountId],
      options: { minLength: 1 },
    },
    {
      destruct: (value: CloudFrontFunctionSchema['properties']): string[] => [value.code],
      options: { maxLength: 10240, minLength: 1 },
    },
    {
      destruct: (value: CloudFrontFunctionSchema['properties']): string[] => [value.name],
      options: { maxLength: 64, minLength: 1, regex: /^[a-zA-Z0-9-_]+$/ },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    code: string;
    name: string;
  }>();

  /**
   * Saved response.
   * * `response.Arn` - The ARN of the function's live stage.
   */
  override response = Schema<{
    Arn?: string;
  }>();
}
