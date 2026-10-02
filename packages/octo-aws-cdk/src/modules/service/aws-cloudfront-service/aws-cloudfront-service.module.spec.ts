import {
  type Account,
  type App,
  MatchingResource,
  Service,
  ServiceType,
  TestContainer,
  TestModuleContainer,
  stub,
} from '@quadnix/octo';
import type { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import type { AwsEcsAlbAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-alb.anchor.schema.js';
import type { AwsLambdaFunctionAnchorSchema } from '../../../anchors/aws-lambda/aws-lambda-function.anchor.schema.js';
import type { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { Alb } from '../../../resources/alb/index.js';
import { EcrImage } from '../../../resources/ecr/index.js';
import { EcrImageTag } from '../../../resources/ecr-image-tag/index.js';
import { IamRole } from '../../../resources/iam-role/index.js';
import { InternetGateway } from '../../../resources/internet-gateway/index.js';
import { LambdaFunction } from '../../../resources/lambda-function/index.js';
import { S3Storage } from '../../../resources/s3-storage/index.js';
import { SecurityGroup } from '../../../resources/security-group/index.js';
import { Subnet } from '../../../resources/subnet/index.js';
import { Vpc } from '../../../resources/vpc/index.js';
import type { AwsCloudFrontServiceModuleSchema } from './index.schema.js';
import { AwsCloudFrontServiceModule } from './index.js';

async function setup(testModuleContainer: TestModuleContainer): Promise<{ account: Account; app: App }> {
  const {
    account: [account],
    app: [app],
    region: [region],
  } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });
  account.addAnchor(
    testModuleContainer.createTestAnchor<AwsAccountAnchorSchema>('AwsAccountAnchor', { awsAccountId: '123' }, account),
  );

  const {
    service: [content],
  } = await testModuleContainer.createTestModels('testModule', {
    service: [new Service('test-bucket-s3-storage', [region], ServiceType.STORAGE, 's3')],
  });
  content.addAnchor(
    testModuleContainer.createTestAnchor<AwsS3StorageServiceAnchorSchema>(
      'AwsS3StorageServiceAnchor',
      { awsAccountId: '123', awsRegionId: 'us-east-1', bucketName: 'test-bucket', contentDigest: 'digest-1' },
      content,
    ),
  );

  const s3Storage = new S3Storage('bucket-test-bucket', {
    awsAccountId: '123',
    awsRegionId: 'us-east-1',
    blockPublicAccess: true,
    Bucket: 'test-bucket',
    permissions: [],
  });
  await testModuleContainer.createResources('testModule', [s3Storage], { save: true });

  return { account, app };
}

/**
 * A Lambda function with a URL, run by an execution in a serverless region, as `AwsLambdaExecutionModule`
 * would have left it: the function anchored on the execution, and created by the execution's overlay.
 */
async function setupLambdaFunction(
  testModuleContainer: TestModuleContainer,
  { account, app }: { account: Account; app: App },
  { timeoutInSeconds = 30 }: { timeoutInSeconds?: number } = {},
): Promise<void> {
  const {
    execution: [execution],
  } = await testModuleContainer.createTestModels('lambdaModule', {
    account: [account],
    app: [app],
    deployment: ['v1'],
    environment: ['qa'],
    execution: [':0:0:0'],
    region: ['serverless-region'],
    server: ['backend'],
    subnet: ['default'],
  });

  const lambdaExecutionOverlayContext = '@octo/aws-lambda-execution-overlay=aws-lambda-execution-overlay-backend';
  const testOverlays = await testModuleContainer.createTestOverlays('lambdaModule', [
    { anchors: [], context: lambdaExecutionOverlayContext },
  ]);
  execution.addAnchor(
    testModuleContainer.createTestAnchor<AwsLambdaFunctionAnchorSchema>(
      'AwsLambdaFunctionAnchor',
      { functionName: 'backend', timeoutInSeconds },
      testOverlays[lambdaExecutionOverlayContext],
    ),
  );

  const iamRole = new IamRole('iam-role-ExecutionRole-backend', {
    awsAccountId: '123',
    policies: [
      { policy: 'lambda.amazonaws.com', policyId: 'LambdaAssumeRolePolicy', policyType: 'assume-role-policy' },
    ],
    rolename: 'ExecutionRole-backend',
  });
  const ecrImage = new EcrImage('ecr-us-east-1-family/image', {
    awsAccountId: '123',
    awsRegionId: 'us-east-1',
    imageId: 'family/image',
  });
  const ecrImageTag = new EcrImageTag(
    'ecr-image-tag-us-east-1-family/image-0-0-1',
    {
      architecture: 'arm64',
      awsAccountId: '123',
      awsRegionId: 'us-east-1',
      dockerfileDirectory: 'images/backend',
      dockerfileName: 'Dockerfile',
      imageId: 'family/image',
      imageTag: '0.0.1',
    },
    [new MatchingResource(ecrImage)],
  );
  const lambdaFunction = new LambdaFunction(
    'lambda-function-backend',
    {
      allowCloudFrontOriginAccess: false,
      architecture: 'arm64',
      awsAccountId: '123',
      awsRegionId: 'us-east-1',
      environmentVariables: {},
      functionName: 'backend',
      imageCommand: [],
      invokerAccountIds: [],
      memoryInMegabytes: 512,
      timeoutInSeconds,
    },
    [new MatchingResource(iamRole), new MatchingResource(ecrImageTag)],
  );
  await testModuleContainer.createResources('lambdaModule', [iamRole, ecrImage, ecrImageTag, lambdaFunction], {
    save: true,
  });
}

/**
 * An internet-facing ALB in a public subnet, as `AwsEcsAlbServiceModule` would have left it: the
 * service anchored with the ALB's name, and the ALB with the network it sits on.
 */
async function setupAlb(
  testModuleContainer: TestModuleContainer,
  { account }: { account: Account; app: App },
): Promise<void> {
  const {
    region: [region],
    subnet: [subnet],
  } = await testModuleContainer.createTestModels('albModule', {
    account: [account],
    region: ['alb-region'],
    subnet: ['public'],
  });
  const {
    service: [albService],
  } = await testModuleContainer.createTestModels('albModule', {
    service: [new Service('web-alb', [subnet], ServiceType.LOAD_BALANCER, 'alb')],
  });
  albService.addAnchor(
    testModuleContainer.createTestAnchor<AwsEcsAlbAnchorSchema>('AwsEcsAlbAnchor', { albName: 'web' }, albService),
  );

  const vpc = new Vpc('vpc-test', {
    awsAccountId: '123',
    awsAvailabilityZones: ['us-east-1a'],
    awsRegionId: 'us-east-1',
    CidrBlock: '10.0.0.0/16',
    InstanceTenancy: 'default',
  });
  const internetGateway = new InternetGateway(
    'igw-test',
    { awsAccountId: '123', awsRegionId: 'us-east-1', internetGatewayName: 'test' },
    [new MatchingResource(vpc)],
  );
  const securityGroup = new SecurityGroup(
    'sec-grp-test',
    { awsAccountId: '123', awsRegionId: 'us-east-1', rules: [] },
    [new MatchingResource(vpc)],
  );
  const subnetResource = new Subnet(
    'subnet-test',
    {
      AvailabilityZone: 'us-east-1a',
      awsAccountId: '123',
      awsRegionId: 'us-east-1',
      CidrBlock: '10.0.0.0/24',
      subnetName: 'public',
    },
    [new MatchingResource(vpc)],
  );
  const alb = new Alb(
    `alb-${region.regionId}-web`,
    {
      awsAccountId: '123',
      awsRegionId: 'us-east-1',
      IpAddressType: 'ipv4',
      Name: 'web',
      Scheme: 'internet-facing',
      Type: 'application',
    },
    [new MatchingResource(internetGateway), new MatchingResource(securityGroup), new MatchingResource(subnetResource)],
  );
  await testModuleContainer.createResources('albModule', [vpc, internetGateway, securityGroup, subnetResource, alb], {
    save: true,
  });
}

function inputs(overrides: Partial<AwsCloudFrontServiceModuleSchema> = {}): any {
  return {
    account: stub('${{testModule.model.account}}'),
    distributionName: 'test-distribution',
    origins: [{ originId: 'site', source: stub('${{testModule.model.service}}') }],
    routes: [{ originId: 'site' }],
    ...overrides,
  };
}

describe('AwsCloudFrontServiceModule UT', () => {
  let testModuleContainer: TestModuleContainer;

  beforeEach(async () => {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize();

    testModuleContainer.registerTerraformConfig({
      providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
    });
    testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
  });

  afterEach(async () => {
    await testModuleContainer.reset();
    await TestContainer.reset();
  });

  it('should call correct actions', async () => {
    await setup(testModuleContainer);
    const { hclRender, modelTransaction, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsCloudFrontServiceModule>(
          [
            {
              inputs: inputs({
                defaultRootObject: 'index.html',
                errorResponses: [{ errorCode: 403, responseCode: 404, responsePagePath: '/error.html' }],
                routes: [{ originId: 'site', pathPattern: '/assets/*' }, { originId: 'site' }],
              }),
              moduleId: 'distribution',
              type: AwsCloudFrontServiceModule,
            },
          ],
          { filterByModuleIds: ['testModule', 'distribution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).toMatchInlineSnapshot(`
     "# distribution/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
       allowed_account_ids = ["123"]
     }

     data "aws_cloudfront_cache_policy" "cloudfront-test-distribution_managed_cache_ManagedCachingOptimized" {
       name = "Managed-CachingOptimized"
       provider = aws._123-us-east-1
     }

     resource "aws_cloudfront_origin_access_control" "cloudfront-test-distribution_origin_access_control_site" {
       provider = aws._123-us-east-1
       name = "cloudfront-test-distribution-site"
       origin_access_control_origin_type = "s3"
       signing_behavior = "always"
       signing_protocol = "sigv4"
     }

     resource "aws_cloudfront_distribution" "cloudfront-test-distribution_distribution" {
       provider = aws._123-us-east-1
       comment = "test-distribution"
       custom_error_response {
         error_caching_min_ttl = 10
         error_code = 403
         response_code = 404
         response_page_path = "/error.html"
       }
       default_cache_behavior {
         allowed_methods = ["GET", "HEAD"]
         cache_policy_id = data.aws_cloudfront_cache_policy.cloudfront-test-distribution_managed_cache_ManagedCachingOptimized.id
         cached_methods = ["GET", "HEAD"]
         compress = true
         target_origin_id = "site"
         viewer_protocol_policy = "redirect-to-https"
       }
       default_root_object = "index.html"
       enabled = true
       http_version = "http2and3"
       is_ipv6_enabled = true
       ordered_cache_behavior {
         allowed_methods = ["GET", "HEAD"]
         cache_policy_id = data.aws_cloudfront_cache_policy.cloudfront-test-distribution_managed_cache_ManagedCachingOptimized.id
         cached_methods = ["GET", "HEAD"]
         compress = true
         target_origin_id = "site"
         viewer_protocol_policy = "redirect-to-https"
         path_pattern = "/assets/*"
       }
       origin {
         connection_attempts = 3
         connection_timeout = 10
         origin_access_control_id = aws_cloudfront_origin_access_control.cloudfront-test-distribution_origin_access_control_site.id
         domain_name = "test-bucket.s3.us-east-1.amazonaws.com"
         origin_id = "site"
       }
       price_class = "PriceClass_All"
       restrictions {
         geo_restriction {
           restriction_type = "none"
         }
       }
       viewer_certificate {
         cloudfront_default_certificate = true
       }

       depends_on = [aws_cloudfront_origin_access_control.cloudfront-test-distribution_origin_access_control_site]
     }

     # distribution/outputs.tf
     output "cloudfront-test-distribution-Arn" {
       value = aws_cloudfront_distribution.cloudfront-test-distribution_distribution.arn
     }

     output "cloudfront-test-distribution-DistributionId" {
       value = aws_cloudfront_distribution.cloudfront-test-distribution_distribution.id
     }

     output "cloudfront-test-distribution-DomainName" {
       value = aws_cloudfront_distribution.cloudfront-test-distribution_distribution.domain_name
     }

     output "cloudfront-test-distribution-HostedZoneId" {
       value = aws_cloudfront_distribution.cloudfront-test-distribution_distribution.hosted_zone_id
     }

     # distribution/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     # distribution/variables.tf
     <empty>

     # testModule/main.tf
     terraform {
       required_version = ">= 1.6.0"
       required_providers {
         aws = {
           source = "hashicorp/aws"
           version = ">= 5.49"
         }
       }
     }

     provider "aws" {
       alias = "_123-us-east-1"
       region = "us-east-1"
       allowed_account_ids = ["123"]
     }

     resource "aws_s3_bucket" "bucket-test-bucket" {
       provider = aws._123-us-east-1
       bucket = "test-bucket"
     }

     resource "aws_s3_bucket_public_access_block" "bucket-test-bucket-public-access" {
       provider = aws._123-us-east-1
       block_public_acls = true
       block_public_policy = true
       bucket = aws_s3_bucket.bucket-test-bucket.id
       ignore_public_acls = true
       restrict_public_buckets = true

       depends_on = [aws_s3_bucket.bucket-test-bucket]
     }

     resource "aws_s3_bucket_policy" "bucket-test-bucket-policy" {
       provider = aws._123-us-east-1
       bucket = aws_s3_bucket.bucket-test-bucket.id
       policy = jsonencode({
         Statement = [{
             Action = ["s3:GetObject"]
             Condition = {
               StringEquals = {
                 "AWS:SourceArn" = var.cloudfront_test_distribution_Arn
               }
             }
             Effect = "Allow"
             Principal = {
               Service = "cloudfront.amazonaws.com"
             }
             Resource = ["\${aws_s3_bucket.bucket-test-bucket.arn}/*"]
             Sid = "cloudfronttestdistributionCloudFrontReadPermission"
           }]
         Version = "2012-10-17"
       })

       depends_on = [aws_s3_bucket_public_access_block.bucket-test-bucket-public-access]
     }

     # testModule/outputs.tf
     output "bucket-test-bucket-Arn" {
       value = aws_s3_bucket.bucket-test-bucket.arn
     }

     output "bucket-test-bucket-awsRegionId" {
       value = "us-east-1"
     }

     output "bucket-test-bucket-Bucket" {
       value = aws_s3_bucket.bucket-test-bucket.id
     }

     output "bucket-test-bucket-RegionalDomainName" {
       value = aws_s3_bucket.bucket-test-bucket.bucket_regional_domain_name
     }

     # testModule/terragrunt.hcl
     remote_state {
       backend = "local"
       generate = {
         path      = "backend.tf"
         if_exists = "overwrite_terragrunt"
       }
       config = {
         path = "\${get_terragrunt_dir()}/terraform.tfstate"
       }
     }

     dependency "distribution" {
       config_path = "../distribution"

       mock_outputs = {
         "cloudfront-test-distribution-Arn" = "arn:aws:cloudfront::000000000000:distribution/E000000000000"
       }
       mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]
       mock_outputs_merge_strategy_with_state = "shallow"
     }

     inputs = {
       cloudfront_test_distribution_Arn = dependency.distribution.outputs["cloudfront-test-distribution-Arn"]
     }

     # testModule/variables.tf
     variable "cloudfront_test_distribution_Arn" {}"
    `);
    expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot(`
     [
       [
         "UniversalModelActionForApp",
       ],
       [
         "UniversalModelActionForAccount",
       ],
       [
         "UniversalModelActionForRegion",
         "AddAwsCloudFrontServiceModelAction",
       ],
       [
         "UniversalModelActionForService",
       ],
       [
         "AddAwsCloudFrontS3OriginOverlayAction",
       ],
     ]
    `);
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-storage=bucket-test-bucket",
       "+ @octo/cloudfront-distribution=cloudfront-test-distribution",
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);
  });

  it('should admit two distributions to one bucket', async () => {
    await setup(testModuleContainer);
    const { hclRender, resourceDiffs } = (
      await testModuleContainer
        .runModules<AwsCloudFrontServiceModule>(
          [
            { inputs: inputs(), moduleId: 'distribution-1', type: AwsCloudFrontServiceModule },
            {
              inputs: inputs({ distributionName: 'test-distribution-2' }),
              moduleId: 'distribution-2',
              type: AwsCloudFrontServiceModule,
            },
          ],
          { filterByModuleIds: ['testModule'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).toContain('"AWS:SourceArn" = var.cloudfront_test_distribution_Arn');
    expect(hclRender).toContain('"AWS:SourceArn" = var.cloudfront_test_distribution_2_Arn');
    expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
     [
       "* @octo/s3-storage=bucket-test-bucket",
       "* @octo/s3-storage=bucket-test-bucket",
       "* @octo/s3-storage=bucket-test-bucket",
     ]
    `);
  });

  it('should serve a Lambda function through its URL, and admit the distribution to it', async () => {
    await setupLambdaFunction(testModuleContainer, await setup(testModuleContainer));
    const { hclRender, modelTransaction } = (
      await testModuleContainer
        .runModules<AwsCloudFrontServiceModule>(
          {
            inputs: inputs({
              origins: [
                { originId: 'site', source: stub('${{testModule.model.service}}') },
                { originId: 'api', source: stub('${{lambdaModule.model.execution}}') },
              ],
              routes: [{ originId: 'api', pathPattern: '/api/*' }, { originId: 'site' }],
            }),
            moduleId: 'distribution',
            type: AwsCloudFrontServiceModule,
          },
          { filterByModuleIds: ['lambdaModule', 'distribution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    // The overlay creating the function runs before the overlay serving it.
    const actions = testModuleContainer.mapTransactionActions(modelTransaction).flat();
    expect(actions.indexOf('UniversalModelActionForaws-lambda-execution-overlay')).toBeLessThan(
      actions.indexOf('AddAwsCloudFrontLambdaOriginOverlayAction'),
    );

    // The distribution reads the function's host name, and the function admits CloudFront by account.
    expect(hclRender).toContain('domain_name = var.lambda_function_backend_FunctionUrlDomainName');
    expect(hclRender).toContain('origin_access_control_origin_type = "lambda"');
    expect(hclRender).toContain('principal = "cloudfront.amazonaws.com"');
    expect(hclRender).toContain('source_account = "123"');
    expect(hclRender).toMatch(/allowed_methods = \["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"\]/);
  });

  it('should serve an ALB over HTTP through its DNS name', async () => {
    await setupAlb(testModuleContainer, await setup(testModuleContainer));
    const { hclRender } = (
      await testModuleContainer
        .runModules<AwsCloudFrontServiceModule>(
          {
            inputs: inputs({
              origins: [
                { originId: 'site', source: stub('${{testModule.model.service}}') },
                { originId: 'web', source: stub('${{albModule.model.service}}') },
              ],
              routes: [{ originId: 'web', pathPattern: '/app/*' }, { originId: 'site' }],
            }),
            moduleId: 'distribution',
            type: AwsCloudFrontServiceModule,
          },
          { filterByModuleIds: ['albModule', 'distribution'], terraformTarget: 'skip' },
        )
        .next()
    ).value!;

    expect(hclRender).toContain('domain_name = var.alb_alb_region_web_DNSName');
    expect(hclRender).toContain('origin_protocol_policy = "http-only"');
    expect(hclRender).toMatch(/allowed_methods = \["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"\]/);
  });

  it('should reject a Lambda function that runs longer than CloudFront waits', async () => {
    await setupLambdaFunction(testModuleContainer, await setup(testModuleContainer), { timeoutInSeconds: 61 });

    await expect(
      testModuleContainer
        .runModules<AwsCloudFrontServiceModule>({
          inputs: inputs({
            origins: [{ originId: 'api', source: stub('${{lambdaModule.model.execution}}') }],
            routes: [{ originId: 'api' }],
          }),
          moduleId: 'distribution',
          type: AwsCloudFrontServiceModule,
        })
        .next(),
    ).rejects.toThrow('Lambda function "backend" times out after 61 seconds, but CloudFront waits 60!');
  });

  describe('input changes', () => {
    it('should close the bucket to a removed distribution', async () => {
      await setup(testModuleContainer);
      await testModuleContainer
        .runModules<AwsCloudFrontServiceModule>(
          { inputs: inputs(), moduleId: 'distribution', type: AwsCloudFrontServiceModule },
          { terraformTarget: 'skip' },
        )
        .next();

      await setup(testModuleContainer);
      const { hclRender, resourceDiffs } = (
        await testModuleContainer
          .runModules<AwsCloudFrontServiceModule>([], {
            filterByModuleIds: ['testModule'],
            terraformTarget: 'skip',
          })
          .next()
      ).value!;

      expect(hclRender).not.toContain('aws_s3_bucket_policy');
      expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot(`
       [
         "* @octo/s3-storage=bucket-test-bucket",
         "* @octo/s3-storage=bucket-test-bucket",
       ]
      `);
    });
  });

  describe('validation', () => {
    const cases: [string, Partial<AwsCloudFrontServiceModuleSchema>, string][] = [
      [
        'an alias without a certificate',
        { aliases: ['www.example.com'] },
        'A CloudFront certificate is required to serve an alias!',
      ],
      [
        'the same originId twice',
        {
          origins: [
            { originId: 'site', source: stub('${{testModule.model.service}}') },
            { originId: 'site', source: stub('${{testModule.model.service}}') },
          ] as any,
        },
        'Origin "site" is declared more than once!',
      ],
      [
        'no default route',
        { routes: [{ originId: 'site', pathPattern: '/assets/*' }] as any },
        'Exactly one route must have no pathPattern: the default route!',
      ],
      [
        'two default routes',
        { routes: [{ originId: 'site' }, { originId: 'site' }] as any },
        'Exactly one route must have no pathPattern: the default route!',
      ],
      [
        'the same path pattern twice',
        {
          routes: [
            { originId: 'site', pathPattern: '/assets/*' },
            { originId: 'site', pathPattern: '/assets/*' },
            { originId: 'site' },
          ] as any,
        },
        'Path pattern "/assets/*" is routed more than once!',
      ],
      [
        'a route naming an unknown origin',
        { routes: [{ originId: 'missing' }, { originId: 'site', pathPattern: '/assets/*' }] as any },
        'Route names unknown origin "missing"!',
      ],
      [
        'an origin no route uses',
        {
          origins: [
            { originId: 'site', source: stub('${{testModule.model.service}}') },
            { originId: 'unused', source: stub('${{testModule.model.service}}') },
          ] as any,
        },
        'Origin "unused" is not used by any route!',
      ],
      [
        'a route naming an undeclared cache policy',
        { routes: [{ cachePolicy: { kind: 'custom', name: 'missing' }, originId: 'site' }] as any },
        'Route names unknown cache policy "missing"!',
      ],
      [
        'a route naming an undeclared origin request policy',
        { routes: [{ originId: 'site', originRequestPolicy: { kind: 'custom', name: 'missing' } }] as any },
        'Route names unknown origin request policy "missing"!',
      ],
      [
        'a route naming an undeclared response headers policy',
        { routes: [{ originId: 'site', responseHeadersPolicy: { kind: 'custom', name: 'missing' } }] as any },
        'Route names unknown response headers policy "missing"!',
      ],
      [
        'an unknown CORS method',
        {
          responseHeadersPolicies: [
            {
              cors: {
                allowCredentials: false,
                allowHeaders: ['*'],
                allowMethods: ['get'],
                allowOrigins: ['*'],
                maxAgeSeconds: 600,
              },
              name: 'headers',
            },
          ] as any,
        },
        'Property "responseHeadersPolicies" in schema could not be validated!',
      ],
      [
        'a cache policy keyed on every header',
        { cachePolicies: [{ headers: { kind: 'all' }, name: 'cache' }] as any },
        'Property "cachePolicies" in schema could not be validated!',
      ],
      [
        'an empty allow list',
        { originRequestPolicies: [{ cookies: { kind: 'allowList', values: [] }, name: 'origin' }] as any },
        'Property "originRequestPolicies" in schema could not be validated!',
      ],
      [
        'an unknown referrer policy',
        {
          responseHeadersPolicies: [{ name: 'headers', securityHeaders: { referrerPolicy: 'always' } }] as any,
        },
        'Property "responseHeadersPolicies" in schema could not be validated!',
      ],
      [
        'an unknown frame option',
        {
          responseHeadersPolicies: [{ name: 'headers', securityHeaders: { frameOptions: 'ALLOW-FROM' } }] as any,
        },
        'Property "responseHeadersPolicies" in schema could not be validated!',
      ],
      [
        'a set of allowed methods CloudFront does not accept',
        { routes: [{ allowedMethods: ['GET', 'POST'], originId: 'site' }] as any },
        'Property "routes" in schema could not be validated!',
      ],
      [
        'a set of cached methods CloudFront does not accept',
        { routes: [{ cachedMethods: ['GET'], originId: 'site' }] as any },
        'Property "routes" in schema could not be validated!',
      ],
      [
        'a route caching a method it does not allow',
        { routes: [{ cachedMethods: ['GET', 'HEAD', 'OPTIONS'], originId: 'site' }] as any },
        'Route "default" caches a method it does not allow!',
      ],
      [
        'an unknown viewer protocol policy',
        { routes: [{ originId: 'site', viewerProtocolPolicy: 'https' }] as any },
        'Property "routes" in schema could not be validated!',
      ],
      [
        'an unknown price class',
        { priceClass: 'PriceClass_50' as any },
        'Property "priceClass" in schema could not be validated!',
      ],
      [
        'a misspelled managed policy',
        { routes: [{ cachePolicy: { kind: 'managed', name: 'CachingOptimized' }, originId: 'site' }] as any },
        'Property "routes" in schema could not be validated!',
      ],
      [
        'a managed policy in the wrong slot',
        { routes: [{ originId: 'site', originRequestPolicy: { kind: 'managed', name: 'Managed-SimpleCORS' } }] as any },
        'Property "routes" in schema could not be validated!',
      ],
    ];

    for (const [name, overrides, message] of cases) {
      it(`should reject ${name}`, async () => {
        await setup(testModuleContainer);

        await expect(
          testModuleContainer
            .runModules<AwsCloudFrontServiceModule>(
              { inputs: inputs(overrides), moduleId: 'distribution', type: AwsCloudFrontServiceModule },
              { terraformTarget: 'skip' },
            )
            .next(),
        ).rejects.toThrow(message);
      });
    }

    it('should reject two origins on one bucket', async () => {
      await setup(testModuleContainer);

      await expect(
        testModuleContainer
          .runModules<AwsCloudFrontServiceModule>(
            [
              {
                inputs: inputs({
                  origins: [
                    { originId: 'site', source: stub('${{testModule.model.service}}') },
                    { originId: 'assets', originPath: '/assets', source: stub('${{testModule.model.service}}') },
                  ] as any,
                  routes: [{ originId: 'assets', pathPattern: '/static/*' }, { originId: 'site' }] as any,
                }),
                moduleId: 'distribution',
                type: AwsCloudFrontServiceModule,
              },
            ],
            { terraformTarget: 'skip' },
          )
          .next(),
      ).rejects.toThrow('Bucket "test-bucket" is named by more than one origin!');
    });
  });
});
