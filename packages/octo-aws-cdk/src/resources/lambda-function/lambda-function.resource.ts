import {
  type AResource,
  ATerraformResource,
  DependencyRelationship,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  type TerraformModuleScope,
  hasNodeName,
} from '@quadnix/octo';
import type { EcrImageTagSchema } from '../ecr-image-tag/index.schema.js';
import type { IamRoleSchema } from '../iam-role/index.schema.js';
import { LambdaFunctionSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<LambdaFunction>('@octo', 'lambda-function', LambdaFunctionSchema, {
  uniqueProperties: [{ path: 'functionName', within: ['awsAccountId', 'awsRegionId'] }],
})
export class LambdaFunction extends ATerraformResource<LambdaFunctionSchema, LambdaFunction> {
  declare parents: [MatchingResource<IamRoleSchema>, MatchingResource<EcrImageTagSchema>];
  declare properties: LambdaFunctionSchema['properties'];
  declare response: LambdaFunctionSchema['response'];

  /**
   * @internal
   */
  constructor(
    resourceId: string,
    properties: LambdaFunctionSchema['properties'],
    parents: [MatchingResource<IamRoleSchema>, MatchingResource<EcrImageTagSchema>],
  ) {
    super(resourceId, properties, parents);

    this.updateLambdaFunctionIamRole();
    this.updateLambdaFunctionImageTag();
  }

  /**
   * @internal
   */
  override async diff(previous: LambdaFunction): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    let shouldConsolidateDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'iam-role')) {
        // Skip updating the function when its iam-role is updated.
        diffs.splice(i, 1);
      } else if (
        diffs[i].field === 'parent' &&
        hasNodeName(diffs[i].value as AResource<any, any>, 'ecr-image-tag') &&
        diffs[i].action !== DiffAction.UPDATE
      ) {
        // Consolidate a new image into a single UPDATE diff.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      } else if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'ecr-image-tag')) {
        // Skip updating the function when its ecr-image-tag is updated.
        diffs.splice(i, 1);
      } else if (diffs[i].field === 'properties' && diffs[i].action === DiffAction.UPDATE) {
        // Consolidate property diffs.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', ''));
    }

    return diffs;
  }

  /**
   * A function belongs to one account and one region, and its name is already in the resource id.
   * Everything else Lambda edits in place.
   *
   * @internal
   */
  override async diffProperties(previous: LambdaFunction): Promise<Diff[]> {
    if (
      previous.properties.awsAccountId !== this.properties.awsAccountId ||
      previous.properties.awsRegionId !== this.properties.awsRegionId
    ) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'the account and region are force-new on aws_lambda_function; a change recreates the function',
        ),
      ];
    }

    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [new Diff(this, DiffAction.UPDATE, 'properties', '')];
    }

    return [];
  }

  /**
   * @internal
   */
  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const [iamRoleParent, imageTagParent] = this.parents;
    const environmentVariables = this.properties.environmentVariables;

    const lambdaFunctionOctoResource = terraform.addOctoTerraformResource(this as LambdaFunction, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const lambdaFunctionTFResource = lambdaFunctionOctoResource.addTerraformResource(
      'aws_lambda_function',
      this.resourceId,
      {
        architectures: [this.properties.architecture],
        ...(Object.keys(environmentVariables).length > 0
          ? { environment: { variables: terraform.mapAttr(environmentVariables) } }
          : {}),
        function_name: this.properties.functionName,
        ...(this.properties.imageCommand.length > 0 ? { image_config: { command: this.properties.imageCommand } } : {}),
        image_uri: terraform.getRef(imageTagParent, 'imageUri'),
        memory_size: this.properties.memoryInMegabytes,
        package_type: 'Image',
        role: terraform.getRef(iamRoleParent, 'Arn'),
        timeout: this.properties.timeoutInSeconds,
      },
    );

    // Answer on a URL only signed requests may call, and admit each caller to it.
    const functionUrlTFResource = lambdaFunctionOctoResource.addTerraformResource(
      'aws_lambda_function_url',
      `${this.resourceId}_url`,
      {
        authorization_type: 'AWS_IAM',
        function_name: terraform.raw(`${lambdaFunctionTFResource.address}.function_name`),
      },
    );
    const functionUrl = terraform.raw(`${functionUrlTFResource.address}.function_url`);
    const functionUrlDomainName = terraform.raw(
      `trimsuffix(trimprefix(${functionUrlTFResource.address}.function_url, "https://"), "/")`,
    );

    // A CloudFront distribution is admitted by account rather than by its ARN, because the distribution
    // already references this function's URL, and referencing its ARN back would close a cycle.
    const allowedCallers: { label: string; principal: string; sourceAccount?: string }[] = [
      ...this.properties.invokerAccountIds.map((accountId) => ({ label: accountId, principal: accountId })),
      ...(this.properties.allowCloudFrontOriginAccess
        ? [
            {
              label: 'cloudfront',
              principal: 'cloudfront.amazonaws.com',
              sourceAccount: this.properties.awsAccountId,
            },
          ]
        : []),
    ];
    for (const invoker of allowedCallers) {
      const sourceAccount = invoker.sourceAccount ? { source_account: invoker.sourceAccount } : {};
      lambdaFunctionOctoResource.addTerraformResource(
        'aws_lambda_permission',
        `${this.resourceId}_url_invoker_${invoker.label}`,
        {
          action: 'lambda:InvokeFunctionUrl',
          function_name: terraform.raw(`${lambdaFunctionTFResource.address}.function_name`),
          function_url_auth_type: 'AWS_IAM',
          principal: invoker.principal,
          ...sourceAccount,
          statement_id: `AllowFunctionUrlInvokeFrom-${invoker.label}`,
        },
      );
      // A URL caller also needs lambda:InvokeFunction; `invoked_via_function_url` is in hashicorp/aws >= 6.28.0.
      lambdaFunctionOctoResource.addTerraformResource(
        'aws_lambda_permission',
        `${this.resourceId}_url_invoker_${invoker.label}_invoke`,
        {
          action: 'lambda:InvokeFunction',
          function_name: terraform.raw(`${lambdaFunctionTFResource.address}.function_name`),
          invoked_via_function_url: true,
          principal: invoker.principal,
          ...sourceAccount,
          statement_id: `AllowInvokeViaFunctionUrlFrom-${invoker.label}`,
        },
      );
    }

    lambdaFunctionOctoResource.output({
      Arn: terraform.raw(`${lambdaFunctionTFResource.address}.arn`),
      FunctionName: terraform.raw(`${lambdaFunctionTFResource.address}.function_name`),
      FunctionUrl: functionUrl,
      FunctionUrlDomainName: functionUrlDomainName,
    });

    if (Object.keys(this.tags).length > 0) {
      lambdaFunctionTFResource.attribute('tags', this.tags);
    }
  }

  /**
   * @internal
   */
  private updateLambdaFunctionIamRole(): void {
    const iamRoleParent = this.parents[0].getActual();
    const lambdaFunctionToIamRoleDep = this.getDependency(iamRoleParent, DependencyRelationship.CHILD)!;

    // Before updating lambda-function must add or replace iam-role.
    lambdaFunctionToIamRoleDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    lambdaFunctionToIamRoleDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.REPLACE);
    // Before replacing lambda-function must replace iam-role.
    lambdaFunctionToIamRoleDep.addBehavior('resourceId', DiffAction.REPLACE, 'resourceId', DiffAction.REPLACE);
  }

  /**
   * Orders this function against the published image it runs.
   *
   * A published image is deleted by octo at commit, outside terraform's own ordering, so nothing
   * else holds it back until the function has stopped naming it.
   *
   * @internal
   */
  private updateLambdaFunctionImageTag(): void {
    const imageTagParent = this.parents[1].getActual();
    const lambdaFunctionToImageTagDep = this.getDependency(imageTagParent, DependencyRelationship.CHILD)!;
    const imageTagToLambdaFunctionDep = imageTagParent.getDependency(this, DependencyRelationship.PARENT)!;

    // Before updating or replacing lambda-function must add ecr-image-tag.
    lambdaFunctionToImageTagDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    lambdaFunctionToImageTagDep.addBehavior('resourceId', DiffAction.REPLACE, 'resourceId', DiffAction.ADD);
    // Before deleting ecr-image-tag must update or replace lambda-function.
    imageTagToLambdaFunctionDep.addBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    imageTagToLambdaFunctionDep.addBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.REPLACE);
  }
}
