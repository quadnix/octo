import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `LambdaFunctionCloudFrontPermissionSchema` class is the schema for the
 * `LambdaFunctionCloudFrontPermission` resource, which admits one CloudFront distribution to invoke one
 * Lambda function through its URL. The function may belong to another app, such as one an extended state
 * holds; the permission is created in the function's account. Terraform provisions it as two
 * [`aws_lambda_permission`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission)
 * blocks.
 *
 * @group Resources/LambdaFunctionCloudFrontPermission
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   cloudfront_distribution((CloudFront<br>Distribution)) --> lambda_function_cloudfront_permission((Lambda<br>Function<br>CloudFront<br>Permission))
 *   lambda_function((Lambda<br>Function)) --> lambda_function_cloudfront_permission
 * ```
 * @overrideProperty resourceId - The resource id is of format
 * `lambda-function-cloudfront-permission-<distribution-name>-<origin-id>`
 */
export class LambdaFunctionCloudFrontPermissionSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account of the function.
   * * `properties.awsRegionId` - The AWS region of the function.
   * * `properties.distributionName` - The name of the distribution admitted. It is part of the
   * permission's statement id, so it holds only letters, digits, `-` and `_`, at most 59 of them.
   * * `properties.functionName` - The name of the function.
   */
  @Validate<unknown>([
    {
      destruct: (value: LambdaFunctionCloudFrontPermissionSchema['properties']): string[] => [
        value.awsAccountId,
        value.awsRegionId,
        value.functionName,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: LambdaFunctionCloudFrontPermissionSchema['properties']): string[] => [value.distributionName],
      options: { regex: /^[\w-]{1,59}$/ },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    distributionName: string;
    functionName: string;
  }>();

  /**
   * Saved response. A permission reports nothing.
   */
  override response = Schema<Record<never, never>>({});
}
