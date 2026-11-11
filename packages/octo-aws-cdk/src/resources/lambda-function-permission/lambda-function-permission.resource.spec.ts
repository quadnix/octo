import { MatchingResource } from '@quadnix/octo';
import { CloudWatchLogGroup } from '../cloudwatch-log-group/cloudwatch-log-group.resource.js';
import { EcrImage } from '../ecr/ecr-image.resource.js';
import { EcrImageTag } from '../ecr-image-tag/ecr-image-tag.resource.js';
import { IamRole } from '../iam-role/iam-role.resource.js';
import { LambdaFunction } from '../lambda-function/lambda-function.resource.js';
import { LambdaFunctionPermission } from './lambda-function-permission.resource.js';

function createLambdaFunctionPermission(roleName = 'ExecutionRole-backend'): LambdaFunctionPermission {
  const iamRole = new IamRole(`iam-role-${roleName}`, {
    awsAccountId: '123456789012',
    policies: [
      { policy: 'lambda.amazonaws.com', policyId: 'LambdaAssumeRolePolicy', policyType: 'assume-role-policy' },
    ],
    rolename: roleName,
  });

  const functionRole = new IamRole('iam-role-ExecutionRole-commons-billing', {
    awsAccountId: '999999999999',
    policies: [
      { policy: 'lambda.amazonaws.com', policyId: 'LambdaAssumeRolePolicy', policyType: 'assume-role-policy' },
    ],
    rolename: 'ExecutionRole-commons-billing',
  });
  const ecrImage = new EcrImage('ecr-us-east-1-commons/billing', {
    awsAccountId: '999999999999',
    awsRegionId: 'us-east-1',
    imageId: 'commons/billing',
  });
  const ecrImageTag = new EcrImageTag(
    'ecr-image-tag-us-east-1-commons/billing-0-0-1',
    {
      architecture: 'arm64',
      awsAccountId: '999999999999',
      awsRegionId: 'us-east-1',
      buildArguments: {},
      buildSecrets: {},
      dockerfileDirectory: 'images/billing',
      dockerfileName: 'Dockerfile',
      imageId: 'commons/billing',
      imageTag: '0.0.1',
    },
    [new MatchingResource(ecrImage)],
  );
  const logGroup = new CloudWatchLogGroup('cloudwatch-log-group-commons-billing', {
    awsAccountId: '999999999999',
    awsRegionId: 'us-east-1',
    logGroupName: '/aws/lambda/commons-billing',
    retentionInDays: 30,
  });
  const lambdaFunction = new LambdaFunction(
    'lambda-function-commons-billing',
    {
      architecture: 'arm64',
      awsAccountId: '999999999999',
      awsRegionId: 'us-east-1',
      environmentVariables: {},
      functionName: 'commons-billing',
      imageCommand: [],
      invokeMode: 'BUFFERED',
      memoryInMegabytes: 512,
      reservedConcurrency: null,
      timeoutInSeconds: 30,
    },
    [new MatchingResource(functionRole), new MatchingResource(ecrImageTag), new MatchingResource(logGroup)],
  );

  return new LambdaFunctionPermission(
    'lambda-function-permission-backend-commons-billing',
    { awsAccountId: '999999999999', awsRegionId: 'us-east-1', functionName: 'commons-billing', roleName },
    [new MatchingResource(iamRole), new MatchingResource(lambdaFunction)],
  );
}

describe('LambdaFunctionPermission UT', () => {
  describe('diffProperties()', () => {
    it('should report nothing when nothing moved', async () => {
      expect(await createLambdaFunctionPermission().diffProperties(createLambdaFunctionPermission())).toEqual([]);
    });

    it('should replace when the role moves', async () => {
      const diffs = await createLambdaFunctionPermission('ExecutionRole-other').diffProperties(
        createLambdaFunctionPermission(),
      );

      expect(diffs.map((d) => `${d.action} ${d.field}`)).toEqual(['replace resourceId']);
    });
  });

  describe('toHCL()', () => {
    it('should admit the role to the function through its URL, in the function account, once IAM has spread it', async () => {
      const emitted: { name: string; spec: any; type: string }[] = [];
      const providers: unknown[] = [];
      const terraform = {
        addOctoTerraformResource: (_resource: unknown, options: unknown): unknown => {
          providers.push(options);
          return {
            addTerraformResource: (type: string, name: string, spec: unknown): void => {
              emitted.push({ name, spec, type });
            },
          };
        },
        getRef: (resource: MatchingResource<any>, key: string): string => `${resource.getActual().resourceId}.${key}`,
        mapAttr: (value: Record<string, unknown>): Record<string, unknown> => value,
      };

      await createLambdaFunctionPermission().toHCL(terraform as any);

      expect(providers).toEqual([{ provider: { accountId: '999999999999', regionId: 'us-east-1' } }]);
      expect(emitted).toMatchInlineSnapshot(`
       [
         {
           "name": "lambda-function-permission-backend-commons-billing_role_propagation",
           "spec": {
             "create_duration": "10s",
             "triggers": {
               "role_arn": "iam-role-ExecutionRole-backend.Arn",
             },
           },
           "type": "time_sleep",
         },
         {
           "name": "lambda-function-permission-backend-commons-billing",
           "spec": {
             "action": "lambda:InvokeFunctionUrl",
             "function_name": "lambda-function-commons-billing.FunctionName",
             "function_url_auth_type": "AWS_IAM",
             "principal": "iam-role-ExecutionRole-backend.Arn",
             "statement_id": "AllowFunctionUrlInvokeFrom-ExecutionRole-backend",
           },
           "type": "aws_lambda_permission",
         },
         {
           "name": "lambda-function-permission-backend-commons-billing_invoke",
           "spec": {
             "action": "lambda:InvokeFunction",
             "function_name": "lambda-function-commons-billing.FunctionName",
             "invoked_via_function_url": true,
             "principal": "iam-role-ExecutionRole-backend.Arn",
             "statement_id": "AllowInvokeViaFunctionUrlFrom-ExecutionRole-backend",
           },
           "type": "aws_lambda_permission",
         },
       ]
      `);
    });
  });
});
