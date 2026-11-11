import { MatchingResource } from '@quadnix/octo';
import { CloudFrontDistribution } from '../cloudfront-distribution/cloudfront-distribution.resource.js';
import { CloudWatchLogGroup } from '../cloudwatch-log-group/cloudwatch-log-group.resource.js';
import { EcrImage } from '../ecr/ecr-image.resource.js';
import { EcrImageTag } from '../ecr-image-tag/ecr-image-tag.resource.js';
import { IamRole } from '../iam-role/iam-role.resource.js';
import { LambdaFunction } from '../lambda-function/lambda-function.resource.js';
import { LambdaFunctionCloudFrontPermission } from './lambda-function-cloudfront-permission.resource.js';

function createDistribution(distributionName: string): CloudFrontDistribution {
  return new CloudFrontDistribution(`cloudfront-${distributionName}`, {
    aliases: [],
    awsAccountId: '999999999999',
    behaviors: [
      {
        allowedMethods: ['GET', 'HEAD'],
        cachedMethods: ['GET', 'HEAD'],
        cachePolicy: { kind: 'managed', name: 'Managed-CachingOptimized' },
        compress: true,
        functionAssociations: [],
        originRequestPolicy: null,
        pathPattern: null,
        responseHeadersPolicy: null,
        targetOriginId: 'website',
        viewerProtocolPolicy: 'redirect-to-https',
      },
    ],
    cachePolicies: [],
    comment: 'test-distribution',
    customErrorResponses: [],
    defaultRootObject: 'index.html',
    distributionName,
    enabled: true,
    geoRestriction: { kind: 'none' },
    httpVersion: 'http2and3',
    originGroups: [],
    originRequestPolicies: [],
    origins: [
      {
        connectionAttempts: 3,
        connectionTimeout: 10,
        customHeaders: {},
        kind: { bucketName: 'test-bucket', bucketRegion: 'us-east-1', kind: 's3' },
        originId: 'website',
        originPath: '',
      },
    ],
    priceClass: 'PriceClass_All',
    responseHeadersPolicies: [],
    viewerCertificate: { kind: 'default' },
  });
}

function createPermission(distributionName = 'production-octo-web'): LambdaFunctionCloudFrontPermission {
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
    imageTagsToKeep: 5,
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

  return new LambdaFunctionCloudFrontPermission(
    `lambda-function-cloudfront-permission-${distributionName}-billing`,
    { awsAccountId: '999999999999', awsRegionId: 'us-east-1', distributionName, functionName: 'commons-billing' },
    [new MatchingResource(createDistribution(distributionName)), new MatchingResource(lambdaFunction)],
  );
}

describe('LambdaFunctionCloudFrontPermission UT', () => {
  describe('constructor()', () => {
    it('should throw when the distribution name cannot be part of a statement id', () => {
      expect(() => createPermission('production.octo')).toThrow();
    });
  });

  describe('diffProperties()', () => {
    it('should report nothing when nothing moved', async () => {
      expect(await createPermission().diffProperties(createPermission())).toEqual([]);
    });

    it('should replace when the distribution moves', async () => {
      const diffs = await createPermission('production-octo').diffProperties(createPermission());

      expect(diffs.map((d) => `${d.action} ${d.field}`)).toEqual(['replace resourceId']);
    });
  });

  describe('toHCL()', () => {
    it('should admit only its distribution to the function through its URL, in the function account', async () => {
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
      };

      await createPermission().toHCL(terraform as any);

      expect(providers).toEqual([{ provider: { accountId: '999999999999', regionId: 'us-east-1' } }]);
      expect(emitted).toMatchInlineSnapshot(`
       [
         {
           "name": "lambda-function-cloudfront-permission-production-octo-web-billing",
           "spec": {
             "action": "lambda:InvokeFunctionUrl",
             "function_name": "lambda-function-commons-billing.FunctionName",
             "function_url_auth_type": "AWS_IAM",
             "principal": "cloudfront.amazonaws.com",
             "source_arn": "cloudfront-production-octo-web.Arn",
             "statement_id": "AllowFunctionUrlInvokeFrom-cloudfront-production-octo-web",
           },
           "type": "aws_lambda_permission",
         },
         {
           "name": "lambda-function-cloudfront-permission-production-octo-web-billing_invoke",
           "spec": {
             "action": "lambda:InvokeFunction",
             "function_name": "lambda-function-commons-billing.FunctionName",
             "invoked_via_function_url": true,
             "principal": "cloudfront.amazonaws.com",
             "source_arn": "cloudfront-production-octo-web.Arn",
             "statement_id": "AllowInvokeViaFunctionUrlFrom-cloudfront-production-octo-web",
           },
           "type": "aws_lambda_permission",
         },
       ]
      `);
    });
  });
});
