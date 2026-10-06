import {
  AModule,
  type Account,
  type Execution,
  type MatchingAnchor,
  Module,
  ModuleError,
  type Region,
  type Server,
} from '@quadnix/octo';
import { AwsDeploymentAnchorSchema } from '../../../anchors/aws-deployment/aws-deployment.anchor.schema.js';
import { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import { AwsEcrImageAnchorSchema } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import { AwsServerlessEnvironmentAnchorSchema } from '../../../anchors/aws-environment/aws-serverless-environment.anchor.schema.js';
import { AwsLambdaExecutionAnchor } from '../../../anchors/aws-lambda/aws-lambda-execution.anchor.js';
import { AwsLambdaFunctionAnchor } from '../../../anchors/aws-lambda/aws-lambda-function.anchor.js';
import { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsS3StorageServiceAccessPrefixAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.schema.js';
import { AwsServerAnchorSchema } from '../../../anchors/aws-server/aws-server.anchor.schema.js';
import { AwsLambdaExecutionModuleSchema } from './index.schema.js';
import { AwsLambdaExecution } from './models/execution/index.js';
import { AwsLambdaExecutionOverlay } from './overlays/aws-lambda-execution/index.js';

/**
 * `AwsLambdaExecutionModule` is a Lambda-based AWS execution module that provides an implementation for
 * the `Execution` model. It runs a deployment's container image as a Lambda function, in a serverless
 * region.
 *
 * The server and the deployment create nothing; this module creates everything Lambda needs to run
 * them: an IAM role trusting Lambda and holding the server's grants, the function, and a URL that only
 * signed requests may call. The role gets no permission to write logs.
 *
 * The function runs outside a VPC, so it ignores the server's security group rules. The deployment
 * must name an image octo publishes into ECR, set a memory from 128 to 10240 MiB and a
 * timeout from 1 to 900 seconds, and listen on at most one tcp port. A deployment that does not is
 * rejected before anything is created. The function runs on the processor the image is published for,
 * and the Lambda Web Adapter forwards each request to the deployment's port, as `AWS_LWA_PORT`.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Deployment, type Environment, type Subnet, stub } from '@quadnix/octo';
 * import { AwsLambdaExecutionModule } from '@quadnix/octo-aws-cdk/modules/execution/aws-lambda-execution';
 *
 * octo.loadModule(AwsLambdaExecutionModule, 'my-execution-module', {
 *   deployment: stub<Deployment>('${{my-deployment-module.model.deployment}}'),
 *   environment: stub<Environment>('${{my-environment-module.model.environment}}'),
 *   environmentVariables: { LOG_LEVEL: 'info' },
 *   executionId: 'backend-v1-qa',
 *   subnet: stub<Subnet>('${{my-subnet-module.model.subnet}}'),
 * });
 * ```
 *
 * @group Modules/Execution/AwsLambdaExecution
 *
 * @reference Resources {@link IamRoleSchema}
 * @reference Resources {@link LambdaFunctionSchema}
 *
 * @see {@link AwsLambdaExecutionModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Execution](/api/octo/class/Execution) to learn more about the `Execution` model.
 */
@Module<AwsLambdaExecutionModule>('@octo', AwsLambdaExecutionModuleSchema)
export class AwsLambdaExecutionModule extends AModule<AwsLambdaExecutionModuleSchema, Execution> {
  /**
   * Creates the execution, checks its deployment has what Lambda needs, and joins it to the image,
   * buckets and tables it uses.
   */
  async onInit(inputs: AwsLambdaExecutionModuleSchema): Promise<(AwsLambdaExecution | AwsLambdaExecutionOverlay)[]> {
    const { deployment, environment, subnet } = inputs;

    if (environment.getParents()['region'][0].to.getContext() !== subnet.getParents()['region'][0].to.getContext()) {
      throw new ModuleError('Environment and Subnet must be in the same region!', this.constructor.name);
    }

    const region = environment.getParents()['region'][0].to as Region;

    // Create a new execution.
    const execution = new AwsLambdaExecution(inputs.executionId, deployment, environment, subnet);
    for (const [key, value] of Object.entries(inputs.environmentVariables || {})) {
      execution.environmentVariables.set(key, value);
    }

    // Add anchors.
    const lambdaExecutionAnchor = new AwsLambdaExecutionAnchor(
      'AwsLambdaExecutionAnchor',
      {
        environmentVariables: Object.fromEntries(execution.environmentVariables.entries()),
        functionName: execution.executionId,
        invokerAccountIds: [...inputs.invokerAccountIds!],
      },
      execution,
    );
    execution.addAnchor(lambdaExecutionAnchor);

    // Get the server's anchors and grants.
    const server = deployment.getParents()['server'][0].to as Server;
    const [matchingServerAnchor] = await server.getAnchorsMatchingSchema(AwsServerAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    if (!matchingServerAnchor) {
      throw new ModuleError(`Server "${server.serverKey}" does not have compatible anchors!`, this.constructor.name);
    }
    const { grants } = matchingServerAnchor.getSchemaInstance().properties;
    const grantAnchors: (
      | MatchingAnchor<AwsS3StorageServiceAccessPrefixAnchorSchema>
      | MatchingAnchor<AwsDynamoDBAnchorSchema>
    )[] = [];
    for (const grant of grants.s3) {
      const [matchingAccessPrefixAnchor] = await server.getAnchorsMatchingSchema(
        AwsS3StorageServiceAccessPrefixAnchorSchema,
        [
          { key: 'accessPrefix', value: grant.accessPrefix },
          { key: 'bucketName', value: grant.bucketName },
        ],
      );

      if (!grantAnchors.some((a) => a.getActual() === matchingAccessPrefixAnchor.getActual())) {
        grantAnchors.push(matchingAccessPrefixAnchor);
      }
    }
    for (const grant of grants.dynamodb) {
      const [matchingDynamoDBAnchor] = await server.getAnchorsMatchingSchema(AwsDynamoDBAnchorSchema, [
        { key: 'awsRegionId', value: grant.awsRegionId },
        { key: 'TableName', value: grant.tableName },
      ]);

      if (!grantAnchors.some((a) => a.getActual() === matchingDynamoDBAnchor.getActual())) {
        grantAnchors.push(matchingDynamoDBAnchor);
      }
    }

    // Check the deployment has what Lambda needs.
    const [matchingDeploymentAnchor] = await deployment.getAnchorsMatchingSchema(AwsDeploymentAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const { command, image, memory, ports, timeoutInSeconds } = matchingDeploymentAnchor.getSchemaInstance().properties;
    if (image.kind !== 'ecr') {
      throw new ModuleError(
        `Deployment "${deployment.deploymentTag}" must run an image octo publishes into ECR to run on Lambda!`,
        this.constructor.name,
      );
    }
    if (!memory || memory < 128 || memory > 10240) {
      throw new ModuleError(
        `Deployment "${deployment.deploymentTag}" needs a memory from 128 to 10240 MiB to run on Lambda!`,
        this.constructor.name,
      );
    }
    if (!timeoutInSeconds || timeoutInSeconds > 900) {
      throw new ModuleError(
        `Deployment "${deployment.deploymentTag}" needs a timeout from 1 to 900 seconds to run on Lambda!`,
        this.constructor.name,
      );
    }
    if (ports.length > 1 || ports.some((p) => p.protocol !== 'tcp')) {
      throw new ModuleError(
        `Deployment "${deployment.deploymentTag}" can listen on at most one tcp port to run on Lambda!`,
        this.constructor.name,
      );
    }

    // Get the image the deployment is linked to.
    const [imageAnchor] = await deployment.getAnchorsMatchingSchema(AwsEcrImageAnchorSchema, [
      { key: 'imageId', value: image.imageId },
    ]);

    // Get environment anchors.
    const [matchingEnvironmentAnchor] = await environment.getAnchorsMatchingSchema(
      AwsServerlessEnvironmentAnchorSchema,
      [],
      { searchBoundaryMembers: false },
    );

    // Name the role this execution runs as.
    const iamRoleName = `ExecutionRole-${execution.executionId}`;

    // Add aws-lambda-execution overlay for the function's lifecycle.
    const executionOverlay = new AwsLambdaExecutionOverlay(
      `aws-lambda-execution-overlay-${region.regionId}-${execution.executionId}`,
      {
        deploymentContainerProperties: {
          image: { imageId: image.imageId, imageTag: image.imageTag },
          imageCommand: command ?? [],
          memoryInMegabytes: memory,
          port: ports[0]?.containerPort ?? null,
          timeoutInSeconds,
        },
        deploymentTag: deployment.deploymentTag,
        environmentName: environment.environmentName,
        executionId: execution.executionId,
        grants,
        iamRoleName,
        invokeMode: inputs.invokeMode!,
        reservedConcurrency: inputs.reservedConcurrency!,
        serverKey: server.serverKey,
      },
      [lambdaExecutionAnchor, matchingEnvironmentAnchor, matchingServerAnchor, imageAnchor, ...grantAnchors],
    );
    execution.addAnchor(
      new AwsLambdaFunctionAnchor(
        'AwsLambdaFunctionAnchor',
        { functionName: execution.executionId, timeoutInSeconds },
        executionOverlay,
      ),
    );

    return [execution, executionOverlay];
  }

  /**
   * Resolves the account and the AWS region this execution runs in.
   */
  override async registerMetadata(
    inputs: AwsLambdaExecutionModuleSchema,
  ): Promise<{ awsAccountId: string; awsRegionId: string }> {
    const region = inputs.environment.getParents()['region'][0].to as Region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsServerlessRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
