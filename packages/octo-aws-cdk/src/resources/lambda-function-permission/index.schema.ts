import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `LambdaFunctionPermissionSchema` class is the schema for the `LambdaFunctionPermission`
 * resource, which admits one IAM role to invoke one Lambda function through its URL. The function may
 * be in another account, such as one an imported state holds; the permission is created there.
 * Terraform provisions it as two
 * [`aws_lambda_permission`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission)
 * blocks.
 *
 * @group Resources/LambdaFunctionPermission
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   iam_role((IAM<br>Role)) --> lambda_function_permission((Lambda<br>Function<br>Permission))
 *   lambda_function((Lambda<br>Function)) --> lambda_function_permission
 * ```
 * @overrideProperty resourceId - The resource id is of format `lambda-function-permission-<execution-id>-<function-name>`
 */
export class LambdaFunctionPermissionSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account of the function.
   * * `properties.awsRegionId` - The AWS region of the function.
   * * `properties.functionName` - The name of the function.
   * * `properties.roleName` - The name of the role admitted.
   */
  @Validate({
    destruct: (value: LambdaFunctionPermissionSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.functionName,
      value.roleName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    functionName: string;
    roleName: string;
  }>();

  /**
   * Saved response. A permission reports nothing.
   */
  override response = Schema<Record<never, never>>({});
}
