import {
  ATerraformResource,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  type TerraformModuleScope,
} from '@quadnix/octo';
import type { IamRoleSchema } from '../iam-role/index.schema.js';
import type { LambdaFunctionSchema } from '../lambda-function/index.schema.js';
import { LambdaFunctionPermissionSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<LambdaFunctionPermission>('@octo', 'lambda-function-permission', LambdaFunctionPermissionSchema, {
  uniqueProperties: [{ path: 'roleName', within: ['awsAccountId', 'awsRegionId', 'functionName'] }],
})
export class LambdaFunctionPermission extends ATerraformResource<
  LambdaFunctionPermissionSchema,
  LambdaFunctionPermission
> {
  declare parents: [MatchingResource<IamRoleSchema>, MatchingResource<LambdaFunctionSchema>];
  declare properties: LambdaFunctionPermissionSchema['properties'];
  declare response: LambdaFunctionPermissionSchema['response'];

  /**
   * @internal
   */
  constructor(
    resourceId: string,
    properties: LambdaFunctionPermissionSchema['properties'],
    parents: [MatchingResource<IamRoleSchema>, MatchingResource<LambdaFunctionSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  /**
   * @internal
   */
  override async diffProperties(previous: LambdaFunctionPermission): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'lambda function permission properties are identity; a change recreates it',
        ),
      ];
    }

    return [];
  }

  /**
   * @internal
   */
  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const [iamRoleParent, lambdaFunctionParent] = this.parents;

    const permissionOctoResource = terraform.addOctoTerraformResource(this as LambdaFunctionPermission, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    // Lambda refuses a role as a principal until IAM has spread it, so a role created in the same
    // apply is waited for first; each permission below depends on the wait.
    permissionOctoResource.addTerraformResource('time_sleep', `${this.resourceId}_role_propagation`, {
      create_duration: '10s',
      triggers: terraform.mapAttr({ role_arn: terraform.getRef(iamRoleParent, 'Arn') }),
    });

    // A URL caller needs both actions; `invoked_via_function_url` is in hashicorp/aws >= 6.28.0.
    permissionOctoResource.addTerraformResource('aws_lambda_permission', this.resourceId, {
      action: 'lambda:InvokeFunctionUrl',
      function_name: terraform.getRef(lambdaFunctionParent, 'FunctionName'),
      function_url_auth_type: 'AWS_IAM',
      principal: terraform.getRef(iamRoleParent, 'Arn'),
      statement_id: `AllowFunctionUrlInvokeFrom-${this.properties.roleName}`,
    });
    permissionOctoResource.addTerraformResource('aws_lambda_permission', `${this.resourceId}_invoke`, {
      action: 'lambda:InvokeFunction',
      function_name: terraform.getRef(lambdaFunctionParent, 'FunctionName'),
      invoked_via_function_url: true,
      principal: terraform.getRef(iamRoleParent, 'Arn'),
      statement_id: `AllowInvokeViaFunctionUrlFrom-${this.properties.roleName}`,
    });
  }
}
