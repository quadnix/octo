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
  StringUtility,
  hasNodeName,
} from '@quadnix/octo';
import { AwsDynamoDBAnchorSchema } from '../../../../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import { AwsLambdaFunctionAnchorSchema } from '../../../../../../anchors/aws-lambda/aws-lambda-function.anchor.schema.js';
import { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import { CloudWatchLogGroup } from '../../../../../../resources/cloudwatch-log-group/index.js';
import { DynamoDBSchema } from '../../../../../../resources/dynamodb/index.schema.js';
import { EcrImageTagSchema } from '../../../../../../resources/ecr-image-tag/index.schema.js';
import { IamRole } from '../../../../../../resources/iam-role/index.js';
import { LambdaFunction } from '../../../../../../resources/lambda-function/index.js';
import { LambdaFunctionSchema } from '../../../../../../resources/lambda-function/index.schema.js';
import { LambdaFunctionPermission } from '../../../../../../resources/lambda-function-permission/index.js';
import type { S3Storage } from '../../../../../../resources/s3-storage/index.js';
import { S3StorageSchema } from '../../../../../../resources/s3-storage/index.schema.js';
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

    // A streaming URL needs the adapter to stream too, or it answers with the adapter's own envelope.
    if (properties.invokeMode === 'RESPONSE_STREAM') {
      environmentVariables['AWS_LWA_INVOKE_MODE'] = 'response_stream';
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

    // Create the log group the function writes to, under the name Lambda gives a function's log group.
    const logGroup = new CloudWatchLogGroup(`cloudwatch-log-group-${lambdaExecutionAnchorProperties.functionName}`, {
      awsAccountId,
      awsRegionId,
      logGroupName: `/aws/lambda/${lambdaExecutionAnchorProperties.functionName}`,
      retentionInDays: properties.logRetentionInDays,
    });

    // Create IAM Role. It may write to the log group, and create none of its own.
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
    iamRole.addCloudWatchLogGroupWritePolicy(`${properties.iamRoleName}-logs`, new MatchingResource(logGroup));

    // Grant the role each bucket prefix, and admit the role to each bucket. A bucket is found through
    // the access prefix anchor this overlay joins.
    for (const grant of properties.grants.s3) {
      const [matchingAccessPrefixAnchor] = await awsLambdaExecutionOverlay.getAnchorsMatchingSchema(
        AwsS3StorageServiceAccessPrefixAnchorSchema,
        [
          { key: 'accessPrefix', value: grant.accessPrefix },
          { key: 'bucketName', value: grant.bucketName },
        ],
        { searchBoundaryMembers: false },
      );
      const [matchingS3StorageResource] = matchingAccessPrefixAnchor
        ? await matchingAccessPrefixAnchor
            .getActual()
            .getParent()
            .getResourcesMatchingSchema(S3StorageSchema, [], [], { searchBoundaryMembers: false })
        : [];
      if (!matchingS3StorageResource) {
        throw new OverlayActionExceptionTransactionError(
          `Bucket "${grant.bucketName}" not found!`,
          diff,
          this.constructor.name,
        );
      }

      const policyId = `${properties.iamRoleName}-${StringUtility.deterministicHash([grant.bucketName, grant.accessPrefix]).substring(0, 12)}`;
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

    // Grant the role each table. A table is found through the table anchor this overlay joins.
    for (const grant of properties.grants.dynamodb) {
      const [matchingDynamoDBAnchor] = await awsLambdaExecutionOverlay.getAnchorsMatchingSchema(
        AwsDynamoDBAnchorSchema,
        [
          { key: 'awsRegionId', value: grant.awsRegionId },
          { key: 'TableName', value: grant.tableName },
        ],
        { searchBoundaryMembers: false },
      );
      const [matchingDynamoDBResource] = matchingDynamoDBAnchor
        ? await matchingDynamoDBAnchor
            .getActual()
            .getParent()
            .getResourcesMatchingSchema(DynamoDBSchema, [], [], { searchBoundaryMembers: false })
        : [];
      if (!matchingDynamoDBResource) {
        throw new OverlayActionExceptionTransactionError(
          `Table "${grant.tableName}" not found in "${grant.awsRegionId}"!`,
          diff,
          this.constructor.name,
        );
      }

      const policyId = `${properties.iamRoleName}-${StringUtility.deterministicHash([grant.awsRegionId, grant.tableName]).substring(0, 12)}`;
      iamRole.addDynamoDBTablePolicy(policyId, matchingDynamoDBResource, {
        allowRead: grant.allowRead,
        allowWrite: grant.allowWrite,
      });
    }

    // Grant the role the server's IAM statements, as written.
    if (properties.grants.iamStatements.length > 0) {
      iamRole.addIamStatementsPolicy(`${properties.iamRoleName}-iam-statements`, properties.grants.iamStatements);
    }

    // Grant the role each function, in one policy, and admit the role to each function. A function is
    // found through the function anchor this overlay joins.
    const lambdaFunctions: MatchingResource<LambdaFunctionSchema>[] = [];
    for (const grant of properties.grants.lambda) {
      const [matchingLambdaFunctionAnchor] = await awsLambdaExecutionOverlay.getAnchorsMatchingSchema(
        AwsLambdaFunctionAnchorSchema,
        [
          { key: 'awsAccountId', value: grant.awsAccountId },
          { key: 'awsRegionId', value: grant.awsRegionId },
          { key: 'functionName', value: grant.functionName },
        ],
        { searchBoundaryMembers: false },
      );
      const [matchingLambdaFunctionResource] = matchingLambdaFunctionAnchor
        ? await matchingLambdaFunctionAnchor
            .getActual()
            .getParent()
            .getResourcesMatchingSchema(LambdaFunctionSchema, [], [], { searchBoundaryMembers: false })
        : [];
      if (!matchingLambdaFunctionResource) {
        throw new OverlayActionExceptionTransactionError(
          `Function "${grant.functionName}" not found in "${grant.awsAccountId}" "${grant.awsRegionId}"!`,
          diff,
          this.constructor.name,
        );
      }
      lambdaFunctions.push(matchingLambdaFunctionResource);

      const lambdaFunctionPermission = new LambdaFunctionPermission(
        `lambda-function-permission-${properties.executionId}-${grant.functionName}`,
        {
          awsAccountId: grant.awsAccountId,
          awsRegionId: grant.awsRegionId,
          functionName: grant.functionName,
          roleName: properties.iamRoleName,
        },
        [new MatchingResource(iamRole), matchingLambdaFunctionResource],
      );
      actionOutputs[lambdaFunctionPermission.resourceId] = lambdaFunctionPermission;
    }
    if (lambdaFunctions.length > 0) {
      iamRole.addLambdaFunctionInvokePolicy(`${properties.iamRoleName}-lambda-functions`, lambdaFunctions);
    }

    // Create Lambda Function.
    const lambdaFunction = new LambdaFunction(
      `lambda-function-${lambdaExecutionAnchorProperties.functionName}`,
      {
        architecture: matchingEcrImageTagResource.getSchemaInstance().properties.architecture,
        awsAccountId,
        awsRegionId,
        environmentVariables,
        functionName: lambdaExecutionAnchorProperties.functionName,
        imageCommand: properties.deploymentContainerProperties.imageCommand,
        invokeMode: properties.invokeMode,
        memoryInMegabytes: properties.deploymentContainerProperties.memoryInMegabytes,
        reservedConcurrency: properties.reservedConcurrency,
        timeoutInSeconds: properties.deploymentContainerProperties.timeoutInSeconds,
      },
      [new MatchingResource(iamRole), matchingEcrImageTagResource, new MatchingResource(logGroup)],
    );

    actionOutputs[logGroup.resourceId] = logGroup;
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
