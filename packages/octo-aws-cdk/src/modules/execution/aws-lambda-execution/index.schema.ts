import {
  type Deployment,
  DeploymentSchema,
  type Environment,
  EnvironmentSchema,
  Schema,
  type Subnet,
  SubnetSchema,
  Validate,
} from '@quadnix/octo';
import { AwsDeploymentAnchorSchema } from '../../../anchors/aws-deployment/aws-deployment.anchor.schema.js';
import { AwsServerlessEnvironmentAnchorSchema } from '../../../anchors/aws-environment/aws-serverless-environment.anchor.schema.js';
import { AwsServerlessSubnetAnchorSchema } from '../../../anchors/aws-subnet/aws-serverless-subnet.anchor.schema.js';

/**
 * `AwsLambdaExecutionModuleSchema` is the input schema for the `AwsLambdaExecutionModule` module.
 * This schema defines which deployment runs on Lambda, where, and who may call it.
 *
 * @group Modules/Execution/AwsLambdaExecution
 *
 * @hideconstructor
 *
 * @see {@link AwsLambdaExecutionModule} to learn more about the `AwsLambdaExecutionModule` module.
 */
export class AwsLambdaExecutionModuleSchema {
  /**
   * The deployment to run. Its image must be one octo publishes into ECR, and it must set a memory
   * and a timeout, and listen on at most one tcp port. The function runs on the processor the image
   * was built for, and the Lambda Web Adapter forwards each request to that port.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsDeploymentAnchorSchema }], NODE_NAME: 'deployment' },
      },
    },
    {
      destruct: (value: AwsLambdaExecutionModuleSchema['deployment']): [DeploymentSchema] => [value.synth()],
      options: {
        isSchema: { schema: DeploymentSchema },
      },
    },
  ])
  deployment = Schema<Deployment>();

  /**
   * The serverless environment to run in.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsServerlessEnvironmentAnchorSchema }], NODE_NAME: 'environment' },
      },
    },
    {
      destruct: (value: AwsLambdaExecutionModuleSchema['environment']): [EnvironmentSchema] => [value.synth()],
      options: {
        isSchema: { schema: EnvironmentSchema },
      },
    },
  ])
  environment = Schema<Environment>();

  /**
   * Environment variables for this execution, on top of the environment's own.
   * Keys must be valid environment variable names (alphanumeric with minimum 2 characters).
   */
  @Validate([
    {
      destruct: (value: Record<string, string>): string[] => Object.keys(value),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: Record<string, string>): string[] => Object.values(value),
      options: { regex: /^.+$/ },
    },
  ])
  environmentVariables? = Schema<Record<string, string>>({});

  /**
   * A unique identifier for this execution. It is also the name of the Lambda function, and part of the
   * name of its IAM role, so it is at most 50 characters. IAM role names are shared by every region of
   * an account, so it must be unique within the account.
   */
  @Validate({ options: { maxLength: 50, minLength: 1, regex: /^[a-zA-Z][\w-]*$/ } })
  executionId = Schema<string>();

  /**
   * How the function's URL returns a response. `BUFFERED`, the default, returns it whole, up to 6 MB.
   * `RESPONSE_STREAM` streams it as the server writes it, up to 200 MB, and tells the Lambda Web Adapter
   * to stream as well.
   */
  @Validate({ options: { regex: /^(BUFFERED|RESPONSE_STREAM)$/ } })
  invokeMode? = Schema<'BUFFERED' | 'RESPONSE_STREAM'>('BUFFERED');

  /**
   * The AWS accounts allowed to call the function's URL.
   */
  @Validate({
    destruct: (value: AwsLambdaExecutionModuleSchema['invokerAccountIds']): string[] => value!,
    options: { regex: /^\d{12}$/ },
  })
  invokerAccountIds? = Schema<string[]>([]);

  /**
   * How many instances of the function may run at once. They are reserved out of the account's
   * concurrency, so other functions cannot take them, and `0` stops the function from running. Left
   * out, nothing is reserved and nothing is capped. AWS keeps 10 of an account's concurrency
   * unreserved, so an account whose limit is 10 can reserve none.
   */
  @Validate({
    destruct: (value: AwsLambdaExecutionModuleSchema['reservedConcurrency']): number[] =>
      value === null || value === undefined ? [] : [value],
    options: { minLength: 0 },
  })
  reservedConcurrency? = Schema<number | null>(null);

  /**
   * The subnet of the serverless region to run in.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsServerlessSubnetAnchorSchema }], NODE_NAME: 'subnet' },
      },
    },
    {
      destruct: (value: AwsLambdaExecutionModuleSchema['subnet']): SubnetSchema[] => [value.synth()],
      options: {
        isSchema: { schema: SubnetSchema },
      },
    },
  ])
  subnet = Schema<Subnet>();
}
