import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingResource,
  OverlayActionExceptionTransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { CloudFrontDistribution } from '../../../../../../resources/cloudfront-distribution/index.js';
import { LambdaFunctionSchema } from '../../../../../../resources/lambda-function/index.schema.js';
import { LambdaFunctionCloudFrontPermission } from '../../../../../../resources/lambda-function-cloudfront-permission/index.js';
import type { AwsCloudFrontServiceModule } from '../../../aws-cloudfront-service.module.js';
import { AwsCloudFrontLambdaOriginOverlay } from '../aws-cloudfront-lambda-origin.overlay.js';

/**
 * @internal
 */
@Action(AwsCloudFrontLambdaOriginOverlay)
export class AddAwsCloudFrontLambdaOriginOverlayAction implements IModelAction<AwsCloudFrontServiceModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsCloudFrontLambdaOriginOverlay &&
      hasNodeName(diff.node, 'aws-cloudfront-lambda-origin-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsCloudFrontLambdaOriginOverlay>,
    actionInputs: EnhancedModuleSchema<AwsCloudFrontServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { originId } = diff.node.properties;
    const { distributionName } = actionInputs.inputs;
    const [, matchingLambdaFunctionAnchor] = diff.node.anchors;
    const { functionName } = matchingLambdaFunctionAnchor.getSchemaInstance().properties;

    const cloudFrontDistribution = actionInputs.resources[`cloudfront-${distributionName}`] as CloudFrontDistribution;

    // Find the function this overlay serves, through the function anchor it joins.
    const [matchingLambdaFunction] = await matchingLambdaFunctionAnchor
      .getActual()
      .getParent()
      .getResourcesMatchingSchema(LambdaFunctionSchema, [{ key: 'functionName', value: functionName }], [], {
        searchBoundaryMembers: false,
      });
    if (!matchingLambdaFunction) {
      throw new OverlayActionExceptionTransactionError(
        `No Lambda function found for "${functionName}"!`,
        diff,
        this.constructor.name,
      );
    }

    // Read the function's URL into the distribution.
    cloudFrontDistribution.addLambdaOrigin(originId, matchingLambdaFunction);
    actionOutputs[cloudFrontDistribution.resourceId] = cloudFrontDistribution;

    // Admit the distribution to the function, in the function's account.
    const { awsAccountId, awsRegionId } = matchingLambdaFunction.getSchemaInstance().properties;
    const permission = new LambdaFunctionCloudFrontPermission(
      `lambda-function-cloudfront-permission-${distributionName}-${originId}`,
      { awsAccountId, awsRegionId, distributionName, functionName },
      [new MatchingResource(cloudFrontDistribution), matchingLambdaFunction],
    );
    actionOutputs[permission.resourceId] = permission;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsCloudFrontLambdaOriginOverlayAction>(AddAwsCloudFrontLambdaOriginOverlayAction)
export class AddAwsCloudFrontLambdaOriginOverlayActionFactory {
  private static instance: AddAwsCloudFrontLambdaOriginOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsCloudFrontLambdaOriginOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsCloudFrontLambdaOriginOverlayAction();
    }
    return this.instance;
  }
}
