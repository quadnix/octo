import { DependencyRelationship, DiffAction, MatchingResource } from '@quadnix/octo';
import { EcrImage } from '../ecr/ecr-image.resource.js';
import { EcrImageTag } from '../ecr-image-tag/ecr-image-tag.resource.js';
import type { EcrImageTagSchema } from '../ecr-image-tag/index.schema.js';
import { IamRole } from '../iam-role/iam-role.resource.js';
import type { IamRoleSchema } from '../iam-role/index.schema.js';
import { LambdaFunctionSchema } from './index.schema.js';
import { LambdaFunction } from './lambda-function.resource.js';

type Properties = LambdaFunctionSchema['properties'];

function properties(overrides: Partial<Properties> = {}): Properties {
  return {
    allowCloudFrontOriginAccess: false,
    architecture: 'arm64',
    awsAccountId: '123456789012',
    awsRegionId: 'us-east-1',
    environmentVariables: {},
    functionName: 'backend',
    imageCommand: [],
    invokeMode: 'BUFFERED',
    invokerAccountIds: [],
    memoryInMegabytes: 512,
    reservedConcurrency: null,
    timeoutInSeconds: 30,
    ...overrides,
  };
}

function createParents(imageTag = '0.0.1'): [MatchingResource<IamRoleSchema>, MatchingResource<EcrImageTagSchema>] {
  const iamRole = new IamRole('iam-role-ExecutionRole-backend', {
    awsAccountId: '123456789012',
    policies: [
      { policy: 'lambda.amazonaws.com', policyId: 'LambdaAssumeRolePolicy', policyType: 'assume-role-policy' },
    ],
    rolename: 'ExecutionRole-backend',
  });
  const ecrImage = new EcrImage('ecr-us-east-1-family/image', {
    awsAccountId: '123456789012',
    awsRegionId: 'us-east-1',
    imageId: 'family/image',
  });
  const ecrImageTag = new EcrImageTag(
    `ecr-image-tag-us-east-1-family/image-${imageTag.replace(/[^\w-]/g, '-')}`,
    {
      architecture: 'arm64',
      awsAccountId: '123456789012',
      awsRegionId: 'us-east-1',
      buildArguments: {},
      buildSecrets: {},
      dockerfileDirectory: 'images/backend',
      dockerfileName: 'Dockerfile',
      imageId: 'family/image',
      imageTag,
    },
    [new MatchingResource(ecrImage)],
  );

  return [new MatchingResource(iamRole), new MatchingResource(ecrImageTag)];
}

function createLambdaFunction(overrides: Partial<Properties> = {}, imageTag?: string): LambdaFunction {
  return new LambdaFunction('lambda-function-backend', properties(overrides), createParents(imageTag));
}

/**
 * A stand-in for the terraform module scope, recording what the resource asked to emit rather than
 * serializing it.
 */
function createRecordingScope(): {
  emitted: { name: string; spec: any; type: string }[];
  outputs: Record<string, unknown>;
  terraform: any;
} {
  const emitted: { name: string; spec: any; type: string }[] = [];
  const outputs: Record<string, unknown> = {};

  const terraform = {
    addOctoTerraformResource: (): unknown => ({
      addTerraformResource: (type: string, name: string, spec: unknown): unknown => {
        emitted.push({ name, spec, type });
        return { address: `${type}.${name}`, attribute: (): void => {} };
      },
      output: (o: Record<string, unknown>): void => {
        Object.assign(outputs, o);
      },
    }),
    getRef: (resource: any, key: string): string => `ref(${resource.getActual().resourceId}.${key})`,
    mapAttr: (value: unknown): unknown => value,
    raw: (value: unknown): unknown => value,
  };

  return { emitted, outputs, terraform };
}

describe('LambdaFunction UT', () => {
  describe('schema', () => {
    const cases: [string, Partial<Properties>][] = [
      ['an unknown architecture', { architecture: 'arm32' as any }],
      ['a function name Lambda does not accept', { functionName: 'back.end' }],
      ['a function name longer than 64 characters', { functionName: 'x'.repeat(65) }],
      ['an invoker that is not an account id', { invokerAccountIds: ['123'] }],
      ['less than 128 MB of memory', { memoryInMegabytes: 64 }],
      ['more than 10240 MB of memory', { memoryInMegabytes: 10241 }],
      ['a timeout over 15 minutes', { timeoutInSeconds: 901 }],
      ['an environment variable Lambda does not accept', { environmentVariables: { '1KEY': 'value' } }],
    ];

    it('should accept a legal function', () => {
      expect(() => {
        new LambdaFunctionSchema().properties = properties({
          environmentVariables: { NODE_ENV: 'qa' },
          imageCommand: ['node', 'main.js'],
          invokerAccountIds: ['210987654321'],
        });
      }).not.toThrow();
    });

    for (const [name, overrides] of cases) {
      it(`should reject ${name}`, () => {
        expect(() => {
          new LambdaFunctionSchema().properties = properties(overrides);
        }).toThrow('Validation error!');
      });
    }
  });

  describe('constructor()', () => {
    it('should order itself against the role it runs as and the published image it runs', () => {
      const lambdaFunction = createLambdaFunction();
      const iamRole = lambdaFunction.parents[0].getActual();
      const ecrImageTag = lambdaFunction.parents[1].getActual();

      const functionToIamRole = lambdaFunction.getDependency(iamRole, DependencyRelationship.CHILD)!;
      const functionToImageTag = lambdaFunction.getDependency(ecrImageTag, DependencyRelationship.CHILD)!;
      const imageTagToFunction = ecrImageTag.getDependency(lambdaFunction, DependencyRelationship.PARENT)!;

      // The role exists, or has been recreated, before the function runs as it.
      expect(functionToIamRole.hasMatchingBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD)).toBe(
        true,
      );
      expect(
        functionToIamRole.hasMatchingBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.REPLACE),
      ).toBe(true);
      expect(
        functionToIamRole.hasMatchingBehavior('resourceId', DiffAction.REPLACE, 'resourceId', DiffAction.REPLACE),
      ).toBe(true);

      // The image is published before the function names it.
      expect(
        functionToImageTag.hasMatchingBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD),
      ).toBe(true);
      expect(
        functionToImageTag.hasMatchingBehavior('resourceId', DiffAction.REPLACE, 'resourceId', DiffAction.ADD),
      ).toBe(true);

      // The function stops naming the image before the image is deleted.
      expect(
        imageTagToFunction.hasMatchingBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE),
      ).toBe(true);
      expect(
        imageTagToFunction.hasMatchingBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.REPLACE),
      ).toBe(true);
      expect(
        imageTagToFunction.hasMatchingBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.DELETE),
      ).toBe(true);
    });
  });

  describe('diff()', () => {
    it('should report nothing when nothing moved', async () => {
      const diffs = await createLambdaFunction().diff(createLambdaFunction());
      expect(diffs).toEqual([]);
    });

    it('should update rather than replace when the memory moves', async () => {
      const diffs = await createLambdaFunction({ memoryInMegabytes: 1024 }).diff(createLambdaFunction());
      expect(diffs.map((d) => `${d.action} ${d.field}`)).toEqual(['update resourceId']);
    });

    it('should update rather than replace when the image moves', async () => {
      const diffs = await createLambdaFunction({}, '0.0.2').diff(createLambdaFunction({}, '0.0.1'));
      expect(diffs.map((d) => `${d.action} ${d.field}`)).toEqual(['update resourceId']);
    });

    it('should replace when the region moves', async () => {
      const diffs = await createLambdaFunction({ awsRegionId: 'us-west-2' }).diff(createLambdaFunction());
      expect(diffs.map((d) => `${d.action} ${d.field}`)).toEqual(['replace resourceId']);
    });
  });

  describe('toHCL()', () => {
    it('should render a function with a signed URL and no invokers', async () => {
      const { emitted, outputs, terraform } = createRecordingScope();
      await createLambdaFunction().toHCL(terraform);

      expect(emitted).toMatchInlineSnapshot(`
       [
         {
           "name": "lambda-function-backend",
           "spec": {
             "architectures": [
               "arm64",
             ],
             "function_name": "backend",
             "image_uri": "ref(ecr-image-tag-us-east-1-family/image-0-0-1.imageUri)",
             "memory_size": 512,
             "package_type": "Image",
             "role": "ref(iam-role-ExecutionRole-backend.Arn)",
             "timeout": 30,
           },
           "type": "aws_lambda_function",
         },
         {
           "name": "lambda-function-backend_url",
           "spec": {
             "authorization_type": "AWS_IAM",
             "function_name": "aws_lambda_function.lambda-function-backend.function_name",
           },
           "type": "aws_lambda_function_url",
         },
       ]
      `);
      expect(outputs).toMatchInlineSnapshot(`
       {
         "Arn": "aws_lambda_function.lambda-function-backend.arn",
         "FunctionName": "aws_lambda_function.lambda-function-backend.function_name",
         "FunctionUrl": "aws_lambda_function_url.lambda-function-backend_url.function_url",
         "FunctionUrlDomainName": "trimsuffix(trimprefix(aws_lambda_function_url.lambda-function-backend_url.function_url, "https://"), "/")",
       }
      `);
    });

    it('should render a signed URL, and a pair of permissions per invoking account', async () => {
      const { emitted, outputs, terraform } = createRecordingScope();
      await createLambdaFunction({
        environmentVariables: { NODE_ENV: 'qa' },
        imageCommand: ['node', 'main.js'],
        invokerAccountIds: ['210987654321'],
      }).toHCL(terraform);

      expect(emitted.slice(1)).toMatchInlineSnapshot(`
       [
         {
           "name": "lambda-function-backend_url",
           "spec": {
             "authorization_type": "AWS_IAM",
             "function_name": "aws_lambda_function.lambda-function-backend.function_name",
           },
           "type": "aws_lambda_function_url",
         },
         {
           "name": "lambda-function-backend_url_invoker_210987654321",
           "spec": {
             "action": "lambda:InvokeFunctionUrl",
             "function_name": "aws_lambda_function.lambda-function-backend.function_name",
             "function_url_auth_type": "AWS_IAM",
             "principal": "210987654321",
             "statement_id": "AllowFunctionUrlInvokeFrom-210987654321",
           },
           "type": "aws_lambda_permission",
         },
         {
           "name": "lambda-function-backend_url_invoker_210987654321_invoke",
           "spec": {
             "action": "lambda:InvokeFunction",
             "function_name": "aws_lambda_function.lambda-function-backend.function_name",
             "invoked_via_function_url": true,
             "principal": "210987654321",
             "statement_id": "AllowInvokeViaFunctionUrlFrom-210987654321",
           },
           "type": "aws_lambda_permission",
         },
       ]
      `);
      expect(emitted[0].spec.environment).toEqual({ variables: { NODE_ENV: 'qa' } });
      expect(emitted[0].spec.image_config).toEqual({ command: ['node', 'main.js'] });
      expect(outputs.FunctionUrl).toBe('aws_lambda_function_url.lambda-function-backend_url.function_url');
    });

    it('should admit CloudFront distributions of its own account, not one distribution by ARN', async () => {
      const { emitted, outputs, terraform } = createRecordingScope();
      const lambdaFunction = createLambdaFunction();
      lambdaFunction.properties.allowCloudFrontOriginAccess = true;
      await lambdaFunction.toHCL(terraform);

      expect(emitted.filter((e) => e.type === 'aws_lambda_permission').map((e) => e.spec)).toMatchInlineSnapshot(`
       [
         {
           "action": "lambda:InvokeFunctionUrl",
           "function_name": "aws_lambda_function.lambda-function-backend.function_name",
           "function_url_auth_type": "AWS_IAM",
           "principal": "cloudfront.amazonaws.com",
           "source_account": "123456789012",
           "statement_id": "AllowFunctionUrlInvokeFrom-cloudfront",
         },
         {
           "action": "lambda:InvokeFunction",
           "function_name": "aws_lambda_function.lambda-function-backend.function_name",
           "invoked_via_function_url": true,
           "principal": "cloudfront.amazonaws.com",
           "source_account": "123456789012",
           "statement_id": "AllowInvokeViaFunctionUrlFrom-cloudfront",
         },
       ]
      `);
      expect(outputs.FunctionUrlDomainName).toBe(
        'trimsuffix(trimprefix(aws_lambda_function_url.lambda-function-backend_url.function_url, "https://"), "/")',
      );
    });
  });
});
