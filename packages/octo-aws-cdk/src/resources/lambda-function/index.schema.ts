import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `LambdaFunctionSchema` class is the schema for the `LambdaFunction` resource, which
 * represents an AWS Lambda function running a container image. Terraform provisions it as
 * [`aws_lambda_function`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function),
 * with an
 * [`aws_lambda_function_url`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function_url)
 * that only signed requests may call. Each caller of the URL - an account, or CloudFront - is admitted by a
 * pair of [`aws_lambda_permission`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_permission),
 * because a function URL needs both `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction`.
 *
 * The function writes no logs: its role is given no permission to, so Lambda creates no log group
 * outside of octo.
 *
 * @group Resources/LambdaFunction
 *
 * @hideconstructor
 *
 * @overrideProperty parents - The IAM role the function runs as, and the published image it runs.
 * ```mermaid
 * graph TD;
 *   iam_role((IAM<br>Role)) --> lambda_function((Lambda<br>Function))
 *   ecr_image_tag((ECR<br>Image Tag)) --> lambda_function
 * ```
 * @overrideProperty resourceId - The resource id is of format `lambda-function-<function-name>`.
 */
export class LambdaFunctionSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.allowCloudFrontOriginAccess` - Whether CloudFront distributions of the function's own
   * account may call its URL, signing each request with an origin access control.
   * * `properties.architecture` - The processor the function runs on. The image must be built for it.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.environmentVariables` - Values the function reads out of its environment.
   * * `properties.functionName` - The name of the function. Part of its identity.
   * * `properties.imageCommand` - The command the image runs, replacing its own. Empty keeps the image's
   * own command.
   * * `properties.invokeMode` - How the function's URL returns a response: `BUFFERED`, whole and up to 6 MB,
   * or `RESPONSE_STREAM`, streamed as the function writes it, up to 200 MB.
   * * `properties.invokerAccountIds` - The AWS accounts allowed to call the function's URL.
   * * `properties.memoryInMegabytes` - How much memory the function gets, from 128 to 10240. It also
   * decides how much CPU the function gets.
   * * `properties.timeoutInSeconds` - How long an invocation may run before Lambda stops it, from 1 to 900.
   */
  @Validate<unknown>([
    {
      destruct: (value: LambdaFunctionSchema['properties']): string[] => [
        value.architecture,
        value.awsAccountId,
        value.awsRegionId,
        value.functionName,
        ...value.imageCommand,
        ...value.invokerAccountIds,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: LambdaFunctionSchema['properties']): string[] => [value.architecture],
      options: { regex: /^(arm64|x86_64)$/ },
    },
    {
      destruct: (value: LambdaFunctionSchema['properties']): string[] => [value.functionName],
      options: { regex: /^[\w-]{1,64}$/ },
    },
    {
      destruct: (value: LambdaFunctionSchema['properties']): string[] => [value.invokeMode],
      options: { regex: /^(BUFFERED|RESPONSE_STREAM)$/ },
    },
    {
      destruct: (value: LambdaFunctionSchema['properties']): string[] => value.invokerAccountIds,
      options: { regex: /^\d{12}$/ },
    },
    {
      destruct: (value: LambdaFunctionSchema['properties']): number[] => [value.memoryInMegabytes],
      options: { maxLength: 10240, minLength: 128 },
    },
    {
      destruct: (value: LambdaFunctionSchema['properties']): number[] => [value.timeoutInSeconds],
      options: { maxLength: 900, minLength: 1 },
    },
    {
      destruct: (value: LambdaFunctionSchema['properties']): string[] => Object.keys(value.environmentVariables),
      options: { regex: /^[a-zA-Z]\w+$/ },
    },
  ])
  override properties = Schema<{
    allowCloudFrontOriginAccess: boolean;
    architecture: 'arm64' | 'x86_64';
    awsAccountId: string;
    awsRegionId: string;
    environmentVariables: Record<string, string>;
    functionName: string;
    imageCommand: string[];
    invokeMode: 'BUFFERED' | 'RESPONSE_STREAM';
    invokerAccountIds: string[];
    memoryInMegabytes: number;
    timeoutInSeconds: number;
  }>();

  /**
   * Saved response.
   * * `response.Arn` - The ARN of the function.
   * * `response.FunctionName` - The name of the function.
   * * `response.FunctionUrl` - The URL the function answers on.
   * * `response.FunctionUrlDomainName` - The host name of the URL, which a CloudFront origin names.
   */
  @Validate({
    destruct: (value: LambdaFunctionSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      if (value.FunctionName) {
        subjects.push(value.FunctionName);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    Arn?: string;
    FunctionName?: string;
    FunctionUrl?: string;
    FunctionUrlDomainName?: string;
  }>({
    Arn: 'arn:aws:lambda:us-east-1:000000000000:function:mock-function',
    FunctionName: 'mock-function',
    FunctionUrl: 'https://mock-function.lambda-url.us-east-1.on.aws/',
    FunctionUrlDomainName: 'mock-function.lambda-url.us-east-1.on.aws',
  });
}
