import {
  ATerraformResource,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  type TerraformModuleScope,
} from '@quadnix/octo';
import type { CloudFrontDistributionSchema } from '../cloudfront-distribution/index.schema.js';
import type { LambdaFunctionSchema } from '../lambda-function/index.schema.js';
import { LambdaFunctionCloudFrontPermissionSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<LambdaFunctionCloudFrontPermission>(
  '@octo',
  'lambda-function-cloudfront-permission',
  LambdaFunctionCloudFrontPermissionSchema,
  {
    uniqueProperties: [{ path: 'distributionName', within: ['awsAccountId', 'awsRegionId', 'functionName'] }],
  },
)
export class LambdaFunctionCloudFrontPermission extends ATerraformResource<
  LambdaFunctionCloudFrontPermissionSchema,
  LambdaFunctionCloudFrontPermission
> {
  declare parents: [MatchingResource<CloudFrontDistributionSchema>, MatchingResource<LambdaFunctionSchema>];
  declare properties: LambdaFunctionCloudFrontPermissionSchema['properties'];
  declare response: LambdaFunctionCloudFrontPermissionSchema['response'];

  /**
   * @internal
   */
  constructor(
    resourceId: string,
    properties: LambdaFunctionCloudFrontPermissionSchema['properties'],
    parents: [MatchingResource<CloudFrontDistributionSchema>, MatchingResource<LambdaFunctionSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  /**
   * @internal
   */
  override async diffProperties(previous: LambdaFunctionCloudFrontPermission): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'lambda function cloudfront permission properties are identity; a change recreates it',
        ),
      ];
    }

    return [];
  }

  /**
   * @internal
   */
  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const [distributionParent, lambdaFunctionParent] = this.parents;

    const permissionOctoResource = terraform.addOctoTerraformResource(this as LambdaFunctionCloudFrontPermission, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    // A URL caller needs both actions; `invoked_via_function_url` is in hashicorp/aws >= 6.28.0.
    permissionOctoResource.addTerraformResource('aws_lambda_permission', this.resourceId, {
      action: 'lambda:InvokeFunctionUrl',
      function_name: terraform.getRef(lambdaFunctionParent, 'FunctionName'),
      function_url_auth_type: 'AWS_IAM',
      principal: 'cloudfront.amazonaws.com',
      source_arn: terraform.getRef(distributionParent, 'Arn'),
      statement_id: `AllowFunctionUrlInvokeFrom-cloudfront-${this.properties.distributionName}`,
    });
    permissionOctoResource.addTerraformResource('aws_lambda_permission', `${this.resourceId}_invoke`, {
      action: 'lambda:InvokeFunction',
      function_name: terraform.getRef(lambdaFunctionParent, 'FunctionName'),
      invoked_via_function_url: true,
      principal: 'cloudfront.amazonaws.com',
      source_arn: terraform.getRef(distributionParent, 'Arn'),
      statement_id: `AllowInvokeViaFunctionUrlFrom-cloudfront-${this.properties.distributionName}`,
    });
  }
}
