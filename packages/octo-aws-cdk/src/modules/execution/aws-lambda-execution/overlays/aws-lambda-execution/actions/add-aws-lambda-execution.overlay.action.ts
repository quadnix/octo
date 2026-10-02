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
import { DynamoDBSchema } from '../../../../../../resources/dynamodb/index.schema.js';
import { EcrImageTagSchema } from '../../../../../../resources/ecr-image-tag/index.schema.js';
import { IamRole } from '../../../../../../resources/iam-role/index.js';
import { LambdaFunction } from '../../../../../../resources/lambda-function/index.js';
import type { S3Storage } from '../../../../../../resources/s3-storage/index.js';
import { S3StorageSchema } from '../../../../../../resources/s3-storage/index.schema.js';
import { CommonUtility } from '../../../../../../utilities/common/common.utility.js';
import type { AwsLambdaExecutionModule } from '../../../aws-lambda-execution.module.js';
import { AwsLambdaExecutionOverlay } from '../aws-lambda-execution.overlay.js';

/**
 * @internal
 */
@Action(AwsLambdaExecutionOverlay)
export class AddAwsLambdaExecutionOverlayAction implements IModelAction<AwsLambdaExecutionModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsLambdaExecutionOverlay &&
      hasNodeName(diff.node, 'aws-lambda-execution-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsLambdaExecutionOverlay>,
    actionInputs: EnhancedModuleSchema<AwsLambdaExecutionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const awsLambdaExecutionOverlay = diff.node;
    const properties = awsLambdaExecutionOverlay.properties;
    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    const [lambdaExecutionAnchor, matchingEnvironmentAnchor, , matchingImageAnchor] = awsLambdaExecutionOverlay.anchors;
    const lambdaExecutionAnchorProperties = lambdaExecutionAnchor.properties;

    // Calculate final environment variables.
    const environmentVariables: Record<string, string> = {
      ...matchingEnvironmentAnchor.getSchemaInstance().properties.environmentVariables,
      ...lambdaExecutionAnchorProperties.environmentVariables,
    };

    // Tell the Lambda Web Adapter which port the deployment's server listens on. The deployment declares
    // it, so it wins over a value set on the environment or the execution. Without a port the adapter
    // keeps its own default of 8080.
    if (properties.deploymentContainerProperties.port) {
      environmentVariables['AWS_LWA_PORT'] = String(properties.deploymentContainerProperties.port);
    }

    // Get the published image this function runs, through the image it is published into.
    const image = matchingImageAnchor.getActual().getParent();
    const [matchingEcrImageTagResource] = await image.getResourcesMatchingSchema(EcrImageTagSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
      { key: 'imageId', value: properties.deploymentContainerProperties.image.imageId },
      { key: 'imageTag', value: properties.deploymentContainerProperties.image.imageTag },
    ]);
    if (!matchingEcrImageTagResource) {
      throw new OverlayActionExceptionTransactionError(
        `Image "${properties.deploymentContainerProperties.image.imageId}:${properties.deploymentContainerProperties.image.imageTag}" is not published in "${awsRegionId}"!`,
        diff,
        this.constructor.name,
      );
    }

    // Create IAM Role. It gets no permission to write logs, so Lambda creates no log group.
    const iamRole = new IamRole(`iam-role-${properties.iamRoleName}`, {
      awsAccountId,
      policies: [
        {
          policy: 'lambda.amazonaws.com',
          policyId: 'LambdaAssumeRolePolicy',
          policyType: 'assume-role-policy',
        },
      ],
      rolename: properties.iamRoleName,
    });

    // Grant the role each bucket prefix, and admit the role to each bucket.
    for (const grant of properties.grants.s3) {
      const [matchingS3StorageResource] = await awsLambdaExecutionOverlay.getResourcesMatchingSchema(S3StorageSchema, [
        { key: 'awsAccountId', value: awsAccountId },
        { key: 'Bucket', value: grant.bucketName },
      ]);
      if (!matchingS3StorageResource) {
        throw new OverlayActionExceptionTransactionError(
          `Bucket "${grant.bucketName}" not found!`,
          diff,
          this.constructor.name,
        );
      }

      const policyId = `${properties.iamRoleName}-${CommonUtility.hash(grant.bucketName, grant.accessPrefix).substring(0, 12)}`;
      iamRole.addS3BucketPolicy(policyId, matchingS3StorageResource, grant.accessPrefix, {
        allowRead: grant.allowRead,
        allowWrite: grant.allowWrite,
      });

      const s3Storage = matchingS3StorageResource.getActual() as S3Storage;
      s3Storage.addPermission(new MatchingResource(iamRole), grant.accessPrefix, {
        allowRead: grant.allowRead,
        allowWrite: grant.allowWrite,
        principalType: 'aws',
      });
      actionOutputs[s3Storage.resourceId] = s3Storage;
    }

    // Grant the role each table.
    for (const grant of properties.grants.dynamodb) {
      const [matchingDynamoDBResource] = await awsLambdaExecutionOverlay.getResourcesMatchingSchema(DynamoDBSchema, [
        { key: 'awsAccountId', value: awsAccountId },
        { key: 'TableName', value: grant.tableName },
      ]);
      if (!matchingDynamoDBResource) {
        throw new OverlayActionExceptionTransactionError(
          `Table "${grant.tableName}" not found in "${awsAccountId}"!`,
          diff,
          this.constructor.name,
        );
      }

      const policyId = `${properties.iamRoleName}-${CommonUtility.hash(grant.tableName).substring(0, 12)}`;
      iamRole.addDynamoDBTablePolicy(policyId, matchingDynamoDBResource, {
        allowRead: grant.allowRead,
        allowWrite: grant.allowWrite,
      });
    }

    // Create Lambda Function.
    const lambdaFunction = new LambdaFunction(
      `lambda-function-${lambdaExecutionAnchorProperties.functionName}`,
      {
        allowCloudFrontOriginAccess: false,
        architecture: matchingEcrImageTagResource.getSchemaInstance().properties.architecture,
        awsAccountId,
        awsRegionId,
        environmentVariables,
        functionName: lambdaExecutionAnchorProperties.functionName,
        imageCommand: properties.deploymentContainerProperties.imageCommand,
        invokerAccountIds: lambdaExecutionAnchorProperties.invokerAccountIds,
        memoryInMegabytes: properties.deploymentContainerProperties.memoryInMegabytes,
        timeoutInSeconds: properties.deploymentContainerProperties.timeoutInSeconds,
      },
      [new MatchingResource(iamRole), matchingEcrImageTagResource],
    );

    actionOutputs[iamRole.resourceId] = iamRole;
    actionOutputs[lambdaFunction.resourceId] = lambdaFunction;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsLambdaExecutionOverlayAction>(AddAwsLambdaExecutionOverlayAction)
export class AddAwsLambdaExecutionOverlayActionFactory {
  private static instance: AddAwsLambdaExecutionOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsLambdaExecutionOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsLambdaExecutionOverlayAction();
    }
    return this.instance;
  }
}
