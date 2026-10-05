import { MatchingResource } from '@quadnix/octo';
import { Alb } from '../alb/index.js';
import { EcrImage } from '../ecr/ecr-image.resource.js';
import { EcrImageTag } from '../ecr-image-tag/ecr-image-tag.resource.js';
import { IamRole } from '../iam-role/iam-role.resource.js';
import { InternetGateway } from '../internet-gateway/index.js';
import { LambdaFunction } from '../lambda-function/lambda-function.resource.js';
import { SecurityGroup } from '../security-group/index.js';
import { Subnet } from '../subnet/index.js';
import { Vpc } from '../vpc/index.js';
import { CloudFrontDistribution } from './cloudfront-distribution.resource.js';
import { CloudFrontDistributionSchema } from './index.schema.js';

type Properties = CloudFrontDistributionSchema['properties'];

const CERTIFICATE_ARN = 'arn:aws:acm:us-east-1:123456789012:certificate/test-certificate';

/**
 * The smallest distribution that is still a legal one: a single origin, and the one behavior that
 * has to exist. Every test below is this plus the thing it is about.
 */
function properties(overrides: Partial<Properties> = {}): Properties {
  return {
    aliases: [],
    awsAccountId: '123',
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
    distributionName: 'test-distribution',
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
    ...overrides,
  };
}

function createDistribution(overrides: Partial<Properties> = {}): CloudFrontDistribution {
  return new CloudFrontDistribution('cloudfront-test-distribution', properties(overrides));
}

/**
 * A function serving behind a URL, with the role and image it needs, for a `lambda` origin to name.
 */
function createLambdaFunction({ timeoutInSeconds = 30 }: { timeoutInSeconds?: number } = {}): LambdaFunction {
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
  return new LambdaFunction(
    'lambda-function-backend',
    {
      allowCloudFrontOriginAccess: true,
      architecture: 'arm64',
      awsAccountId: '123',
      awsRegionId: 'us-east-1',
      environmentVariables: {},
      functionName: 'backend',
      imageCommand: [],
      invokeMode: 'BUFFERED',
      invokerAccountIds: [],
      memoryInMegabytes: 512,
      timeoutInSeconds,
    },
    [new MatchingResource(iamRole), new MatchingResource(ecrImageTag)],
  );
}

/**
 * A distribution whose one origin is the Lambda function from `createLambdaFunction()`, not yet
 * attached to it.
 */
function createLambdaDistribution(): CloudFrontDistribution {
  return new CloudFrontDistribution(
    'cloudfront-test-distribution',
    properties({
      behaviors: [{ ...properties().behaviors[0], targetOriginId: 'api' }],
      origins: [
        {
          connectionAttempts: 3,
          connectionTimeout: 10,
          customHeaders: {},
          kind: { kind: 'lambda' },
          originId: 'api',
          originPath: '',
        },
      ],
    }),
  );
}

/**
 * An internet-facing ALB, with the VPC, internet gateway, security group and subnet it sits on, for an
 * `alb` origin to name.
 */
function createAlb(): Alb {
  const vpc = new MatchingResource(
    new Vpc('vpc-test', {
      awsAccountId: '123',
      awsAvailabilityZones: ['us-east-1a'],
      awsRegionId: 'us-east-1',
      CidrBlock: '10.0.0.0/16',
      InstanceTenancy: 'default',
    }),
  );
  const alb = new MatchingResource(
    new Alb(
      'alb-test',
      {
        awsAccountId: '123',
        awsRegionId: 'us-east-1',
        IpAddressType: 'ipv4',
        Name: 'test',
        Scheme: 'internet-facing',
        Type: 'application',
      },
      [
        new MatchingResource(
          new InternetGateway(
            'igw-test',
            { awsAccountId: '123', awsRegionId: 'us-east-1', internetGatewayName: 'test' },
            [vpc],
          ),
        ),
        new MatchingResource(
          new SecurityGroup('sec-grp-test', { awsAccountId: '123', awsRegionId: 'us-east-1', rules: [] }, [vpc]),
        ),
        new MatchingResource(
          new Subnet(
            'subnet-test',
            {
              AvailabilityZone: 'us-east-1a',
              awsAccountId: '123',
              awsRegionId: 'us-east-1',
              CidrBlock: '10.0.0.0/24',
              subnetName: 'test',
            },
            [vpc],
          ),
        ),
      ],
    ),
  );
  return alb.getActual() as Alb;
}

/**
 * A distribution whose one origin is the ALB from `createAlb()`, not yet attached to it.
 */
function createAlbDistribution(): CloudFrontDistribution {
  return new CloudFrontDistribution(
    'cloudfront-test-distribution',
    properties({
      behaviors: [{ ...properties().behaviors[0], targetOriginId: 'web' }],
      origins: [
        {
          connectionAttempts: 3,
          connectionTimeout: 10,
          customHeaders: {},
          kind: { kind: 'alb' },
          originId: 'web',
          originPath: '',
        },
      ],
    }),
  );
}

describe('CloudFrontDistribution UT', () => {
  describe('schema', () => {
    const cases: [string, Partial<Properties>][] = [
      ['an alias that is not a host name', { aliases: ['not a host'] }],
      ['a comment longer than 128 characters', { comment: 'x'.repeat(129) }],
      ['a default root object starting with a slash', { defaultRootObject: '/index.html' }],
      ['a lowercase country code', { geoRestriction: { countries: ['de'], kind: 'block' } }],
      ['a geo restriction naming no country', { geoRestriction: { countries: [], kind: 'allow' } }],
      ['an unknown HTTP version', { httpVersion: 'http4' as any }],
      ['an unknown price class', { priceClass: 'PriceClass_50' as any }],
      [
        'an unknown minimum protocol version',
        {
          viewerCertificate: { certificateArn: CERTIFICATE_ARN, kind: 'acm', minimumProtocolVersion: 'SSLv3' as any },
        },
      ],
      ['a flag that is not a boolean', { enabled: 'true' as any }],
      [
        'a set of allowed methods CloudFront does not accept',
        { behaviors: [{ ...properties().behaviors[0], allowedMethods: ['GET', 'POST'] as any }] },
      ],
      [
        'a set of cached methods CloudFront does not accept',
        { behaviors: [{ ...properties().behaviors[0], cachedMethods: ['GET'] as any }] },
      ],
      [
        'an unknown viewer protocol policy',
        { behaviors: [{ ...properties().behaviors[0], viewerProtocolPolicy: 'https' as any }] },
      ],
      [
        'an unknown edge function kind',
        {
          behaviors: [
            {
              ...properties().behaviors[0],
              functionAssociations: [{ arn: 'arn', eventType: 'viewer-request', kind: 'lambda' as any }],
            },
          ],
        },
      ],
      [
        'an unknown edge function event type',
        {
          behaviors: [
            {
              ...properties().behaviors[0],
              functionAssociations: [{ arn: 'arn', eventType: 'viewer' as any, kind: 'lambda-edge' }],
            },
          ],
        },
      ],
    ];

    it('should accept a legal distribution', () => {
      expect(() => {
        new CloudFrontDistributionSchema().properties = properties({
          aliases: ['www.example.com', '*.example.com'],
          geoRestriction: { countries: ['DE', 'FR'], kind: 'allow' },
          viewerCertificate: { certificateArn: CERTIFICATE_ARN, kind: 'acm', minimumProtocolVersion: 'TLSv1.2_2021' },
        });
      }).not.toThrow();
    });

    it('should accept allowed methods in any order', () => {
      expect(() => {
        new CloudFrontDistributionSchema().properties = properties({
          behaviors: [{ ...properties().behaviors[0], allowedMethods: ['OPTIONS', 'HEAD', 'GET'] as any }],
        });
      }).not.toThrow();
    });

    for (const [name, overrides] of cases) {
      it(`should reject ${name}`, () => {
        expect(() => {
          new CloudFrontDistributionSchema().properties = properties(overrides);
        }).toThrow('Validation error!');
      });
    }
  });

  describe('validation', () => {
    it('should reject two origins sharing an id', () => {
      expect(() =>
        createDistribution({
          origins: [
            ...properties().origins,
            {
              ...properties().origins[0],
              kind: { bucketName: 'other-bucket', bucketRegion: 'us-east-1', kind: 's3' },
            },
          ],
        }),
      ).toThrowErrorMatchingInlineSnapshot(`"CloudFront origin id "website" is declared more than once!"`);
    });

    it('should reject an origin group sharing an id with an origin', () => {
      expect(() =>
        createDistribution({
          originGroups: [
            {
              failoverOriginId: 'website',
              failoverStatusCodes: [500],
              originGroupId: 'website',
              primaryOriginId: 'website',
            },
          ],
        }),
      ).toThrowErrorMatchingInlineSnapshot(`"CloudFront origin id "website" is declared more than once!"`);
    });

    it('should reject two origins claiming one bucket', () => {
      expect(() =>
        createDistribution({
          origins: [...properties().origins, { ...properties().origins[0], originId: 'website-2' }],
        }),
      ).toThrowErrorMatchingInlineSnapshot(`"CloudFront bucket "test-bucket" is claimed by more than one origin!"`);
    });

    it('should reject an S3 origin whose bucket name holds a dot', () => {
      expect(() =>
        createDistribution({
          origins: [
            {
              ...properties().origins[0],
              kind: { bucketName: 'my-test.website.com', bucketRegion: 'us-east-1', kind: 's3' },
            },
          ],
        }),
      ).toThrowErrorMatchingInlineSnapshot(
        `"CloudFront cannot reach an S3 origin whose bucket name holds a dot, "my-test.website.com"!"`,
      );
    });

    it('should reject an origin group naming an origin that is not there', () => {
      expect(() =>
        createDistribution({
          originGroups: [
            {
              failoverOriginId: 'backup',
              failoverStatusCodes: [500],
              originGroupId: 'website-group',
              primaryOriginId: 'website',
            },
          ],
        }),
      ).toThrowErrorMatchingInlineSnapshot(`"CloudFront origin group "website-group" names unknown origin "backup"!"`);
    });

    it('should reject a distribution with no default behavior', () => {
      expect(() =>
        createDistribution({
          behaviors: [{ ...properties().behaviors[0], pathPattern: '/api/*' }],
        }),
      ).toThrowErrorMatchingInlineSnapshot(
        `"A CloudFront distribution needs exactly one behavior without a path pattern!"`,
      );
    });

    it('should reject a distribution with two default behaviors', () => {
      expect(() =>
        createDistribution({ behaviors: [...properties().behaviors, ...properties().behaviors] }),
      ).toThrowErrorMatchingInlineSnapshot(
        `"A CloudFront distribution needs exactly one behavior without a path pattern!"`,
      );
    });

    it('should reject a behavior naming an origin that is not there', () => {
      expect(() =>
        createDistribution({
          behaviors: [{ ...properties().behaviors[0], targetOriginId: 'nowhere' }],
        }),
      ).toThrowErrorMatchingInlineSnapshot(`"CloudFront behavior names unknown origin "nowhere"!"`);
    });

    it('should reject a behavior caching a method it does not allow', () => {
      expect(() =>
        createDistribution({
          behaviors: [{ ...properties().behaviors[0], cachedMethods: ['GET', 'HEAD', 'OPTIONS'] }],
        }),
      ).toThrowErrorMatchingInlineSnapshot(`"CloudFront cannot cache a method it does not allow!"`);
    });

    it('should reject a behavior naming a custom policy that is not declared', () => {
      expect(() =>
        createDistribution({
          behaviors: [{ ...properties().behaviors[0], cachePolicy: { kind: 'custom', name: 'never-declared' } }],
        }),
      ).toThrowErrorMatchingInlineSnapshot(`"CloudFront behavior names unknown custom policy "never-declared"!"`);
    });

    it('should accept a behavior naming a custom policy that is declared', () => {
      expect(() =>
        createDistribution({
          behaviors: [{ ...properties().behaviors[0], cachePolicy: { kind: 'custom', name: 'declared' } }],
          cachePolicies: [{ name: 'declared' }],
        }),
      ).not.toThrow();
    });

    it('should reject an alias with no certificate to serve it', () => {
      expect(() => createDistribution({ aliases: ['www.example.com'] })).toThrowErrorMatchingInlineSnapshot(
        `"A CloudFront alias needs a certificate covering it!"`,
      );
    });

    it('should reject a certificate CloudFront cannot read', () => {
      expect(() =>
        createDistribution({
          aliases: ['www.example.com'],
          viewerCertificate: {
            certificateArn: 'arn:aws:acm:eu-west-1:123456789012:certificate/test-certificate',
            kind: 'acm',
            minimumProtocolVersion: 'TLSv1.2_2021',
          },
        }),
      ).toThrowErrorMatchingInlineSnapshot(`"CloudFront only reads a certificate from "us-east-1"!"`);
    });

    it('should reject a CloudFront Function bound to an origin event', () => {
      expect(() =>
        createDistribution({
          behaviors: [
            {
              ...properties().behaviors[0],
              functionAssociations: [
                {
                  arn: 'arn:aws:cloudfront::123456789012:function/rewrite',
                  eventType: 'origin-request',
                  kind: 'cloudfront-function',
                },
              ],
            },
          ],
        }),
      ).toThrowErrorMatchingInlineSnapshot(
        `"A CloudFront Function cannot run on "origin-request"! Use Lambda@Edge instead."`,
      );
    });

    it('should accept Lambda@Edge bound to an origin event', () => {
      expect(() =>
        createDistribution({
          behaviors: [
            {
              ...properties().behaviors[0],
              functionAssociations: [
                {
                  arn: 'arn:aws:lambda:us-east-1:123456789012:function:rewrite:1',
                  eventType: 'origin-request',
                  kind: 'lambda-edge',
                },
              ],
            },
          ],
        }),
      ).not.toThrow();
    });
  });

  describe('addLambdaOrigin()', () => {
    it('should make the function a parent of the distribution', () => {
      const distribution = createLambdaDistribution();
      distribution.addLambdaOrigin('api', new MatchingResource(createLambdaFunction()));

      expect(distribution.parents.map((p) => p.getActual().resourceId)).toEqual(['lambda-function-backend']);
      expect(distribution.properties.origins[0].kind).toEqual({
        kind: 'lambda',
        resourceId: 'lambda-function-backend',
      });
    });

    it('should add the parent once when called twice', () => {
      const distribution = createLambdaDistribution();
      const lambdaFunction = new MatchingResource(createLambdaFunction());
      distribution.addLambdaOrigin('api', lambdaFunction);
      distribution.addLambdaOrigin('api', lambdaFunction);

      expect(distribution.parents).toHaveLength(1);
    });

    it('should reject an origin that is not a Lambda origin', () => {
      expect(() => createDistribution().addLambdaOrigin('api', new MatchingResource(createLambdaFunction()))).toThrow(
        'No lambda origin "api"!',
      );
    });
  });

  describe('addLambdaOrigin() timeout', () => {
    it('should accept a function that answers within the 60 seconds CloudFront waits', () => {
      const distribution = createLambdaDistribution();
      distribution.addLambdaOrigin('api', new MatchingResource(createLambdaFunction({ timeoutInSeconds: 60 })));

      expect(distribution.parents).toHaveLength(1);
    });

    it('should reject a function that runs longer than CloudFront waits', () => {
      expect(() =>
        createLambdaDistribution().addLambdaOrigin(
          'api',
          new MatchingResource(createLambdaFunction({ timeoutInSeconds: 61 })),
        ),
      ).toThrow('Lambda function "backend" times out after 61 seconds, but CloudFront waits 60!');
    });
  });

  describe('addAlbOrigin()', () => {
    it('should make the ALB a parent of the distribution', () => {
      const distribution = createAlbDistribution();
      distribution.addAlbOrigin('web', new MatchingResource(createAlb()));

      expect(distribution.parents.map((p) => p.getActual().resourceId)).toEqual(['alb-test']);
      expect(distribution.properties.origins[0].kind).toEqual({ kind: 'alb', resourceId: 'alb-test' });
    });

    it('should reject an origin that is not an ALB origin', () => {
      expect(() => createDistribution().addAlbOrigin('web', new MatchingResource(createAlb()))).toThrow(
        'No alb origin "web"!',
      );
    });
  });

  describe('diffProperties()', () => {
    it('should report nothing when nothing moved', async () => {
      const diffs = await createDistribution().diffProperties(createDistribution());
      expect(diffs).toEqual([]);
    });

    it('should update rather than replace when an alias is added', async () => {
      const previous = createDistribution();
      const current = createDistribution({
        aliases: ['www.example.com'],
        viewerCertificate: {
          certificateArn: CERTIFICATE_ARN,
          kind: 'acm',
          minimumProtocolVersion: 'TLSv1.2_2021',
        },
      });

      const diffs = await current.diffProperties(previous);
      expect(diffs.map((d) => `${d.action} ${d.field}`)).toMatchInlineSnapshot(`
       [
         "update properties",
       ]
      `);
    });

    it('should update rather than replace when an origin is added', async () => {
      const previous = createDistribution();
      const current = createDistribution({
        origins: [
          ...properties().origins,
          {
            connectionAttempts: 3,
            connectionTimeout: 10,
            customHeaders: {},
            kind: {
              domainName: 'api.example.com',
              httpPort: 80,
              httpsPort: 443,
              keepaliveTimeout: 5,
              kind: 'custom',
              originProtocolPolicy: 'https-only',
              readTimeout: 30,
              sslProtocols: ['TLSv1.2'],
            },
            originId: 'api',
            originPath: '',
          },
        ],
      });

      const diffs = await current.diffProperties(previous);
      expect(diffs.map((d) => `${d.action} ${d.field}`)).toMatchInlineSnapshot(`
       [
         "update properties",
       ]
      `);
    });

    it('should replace when the account moves', async () => {
      const previous = createDistribution();
      const current = createDistribution({ awsAccountId: '456' });

      const diffs = await current.diffProperties(previous);
      expect(diffs.map((d) => `${d.action} ${d.field}`)).toMatchInlineSnapshot(`
       [
         "replace resourceId",
       ]
      `);
    });
  });

  describe('toHCL()', () => {
    /**
     * A stand-in for the terraform module scope, recording what the resource asked to emit rather
     * than serializing it. What matters here is the shape the resource builds - which blocks, with
     * which arguments, referring to which other blocks - and the serializer that turns that into
     * text is octo's, tested there.
     */
    function createRecordingScope(): {
      emitted: { name: string; spec: unknown; type: string }[];
      outputs: Record<string, unknown>;
      terraform: any;
    } {
      const emitted: { name: string; spec: unknown; type: string }[] = [];
      const outputs: Record<string, unknown> = {};

      type EmittedBlock = { address: string; attribute: () => void; ref: (key: string) => string };

      const record =
        (kind: string) =>
        (type: string, name: string, spec: unknown): EmittedBlock => {
          emitted.push({ name, spec, type: `${kind} ${type}` });
          // A data source is addressed as `data.<type>.<name>`, a resource as `<type>.<name>`.
          const address = kind === 'data' ? `data.${type}.${name}` : `${type}.${name}`;
          return { address, attribute: (): void => {}, ref: (key: string): string => `${address}.${key}` };
        };

      const terraform = {
        addOctoTerraformResource: (): {
          addTerraformResource: (type: string, name: string, spec: unknown) => EmittedBlock;
          output: (o: Record<string, unknown>) => void;
        } => ({
          addTerraformResource: record('resource'),
          output: (o: Record<string, unknown>): void => {
            Object.assign(outputs, o);
          },
        }),
        addTerraformData: record('data'),
        getProviderAliasRef: (accountId: string): string => `aws.${accountId}`,
        getRef: (resource: any, key: string): string => `ref(${resource.getActual().resourceId}.${key})`,
        raw: (value: unknown): unknown => value,
      };

      return { emitted, outputs, terraform };
    }

    it('should render a minimal distribution', async () => {
      const { emitted, outputs, terraform } = createRecordingScope();
      await createDistribution().toHCL(terraform);

      expect(emitted.map((e) => `${e.type} ${e.name}`)).toMatchInlineSnapshot(`
       [
         "data aws_cloudfront_cache_policy cloudfront-test-distribution_managed_cache_ManagedCachingOptimized",
         "resource aws_cloudfront_origin_access_control cloudfront-test-distribution_origin_access_control_website",
         "resource aws_cloudfront_distribution cloudfront-test-distribution_distribution",
       ]
      `);
      expect(Object.keys(outputs).sort()).toMatchInlineSnapshot(`
       [
         "Arn",
         "DistributionId",
         "DomainName",
         "HostedZoneId",
       ]
      `);
    });

    it('should keep an origin access control name within what AWS accepts', async () => {
      const longOriginId = 'a-very-long-origin-name-that-nobody-would-shorten-on-purpose';
      const distribution = new CloudFrontDistribution(
        'cloudfront-a-distribution-with-a-long-name-of-its-own',
        properties({
          behaviors: [{ ...properties().behaviors[0], targetOriginId: longOriginId }],
          origins: [{ ...properties().origins[0], originId: longOriginId }],
        }),
      );

      const { emitted, terraform } = createRecordingScope();
      await distribution.toHCL(terraform);

      const originAccessControl = emitted.find((e) => e.type.endsWith('aws_cloudfront_origin_access_control'))!
        .spec as { name: string };
      expect(originAccessControl.name.length).toBeLessThanOrEqual(64);
      // The tail is a digest of the whole name, so two long names that differ anywhere still differ
      // here, and the same name always renders the same way.
      expect(originAccessControl.name).toMatch(/^cloudfront-a-distribution-with-a-long-name-.*-[0-9a-f]{8}$/);
    });

    it("should write an S3 origin's hostname down rather than reference it", async () => {
      const { emitted, terraform } = createRecordingScope();
      await createDistribution().toHCL(terraform);

      const distribution = emitted.find((e) => e.type.endsWith('aws_cloudfront_distribution'))!.spec as any;
      expect(distribution.origin[0].domain_name).toBe('test-bucket.s3.us-east-1.amazonaws.com');
    });

    it('should reach an ALB origin through its DNS name, over HTTP', async () => {
      const distribution = createAlbDistribution();
      distribution.addAlbOrigin('web', new MatchingResource(createAlb()));

      const { emitted, terraform } = createRecordingScope();
      await distribution.toHCL(terraform);

      expect(emitted.some((e) => e.type.endsWith('aws_cloudfront_origin_access_control'))).toBe(false);
      const rendered = emitted.find((e) => e.type.endsWith('aws_cloudfront_distribution'))!.spec as any;
      expect(rendered.origin[0]).toEqual({
        connection_attempts: 3,
        connection_timeout: 10,
        custom_origin_config: {
          http_port: 80,
          https_port: 443,
          origin_keepalive_timeout: 5,
          origin_protocol_policy: 'http-only',
          origin_read_timeout: 30,
          origin_ssl_protocols: ['TLSv1.2'],
        },
        domain_name: 'ref(alb-test.DNSName)',
        origin_id: 'web',
      });
    });

    it("should reach a Lambda origin through its URL's host name, signed by an origin access control", async () => {
      const distribution = createLambdaDistribution();
      distribution.addLambdaOrigin('api', new MatchingResource(createLambdaFunction()));

      const { emitted, terraform } = createRecordingScope();
      await distribution.toHCL(terraform);

      const originAccessControl = emitted.find((e) => e.type.endsWith('aws_cloudfront_origin_access_control'))!;
      expect((originAccessControl.spec as any).origin_access_control_origin_type).toBe('lambda');
      const rendered = emitted.find((e) => e.type.endsWith('aws_cloudfront_distribution'))!.spec as any;
      expect(rendered.origin[0]).toMatchInlineSnapshot(`
       {
         "connection_attempts": 3,
         "connection_timeout": 10,
         "custom_origin_config": {
           "http_port": 80,
           "https_port": 443,
           "origin_keepalive_timeout": 5,
           "origin_protocol_policy": "https-only",
           "origin_read_timeout": 60,
           "origin_ssl_protocols": [
             "TLSv1.2",
           ],
         },
         "domain_name": "ref(lambda-function-backend.FunctionUrlDomainName)",
         "origin_access_control_id": "aws_cloudfront_origin_access_control.cloudfront-test-distribution_origin_access_control_api.id",
         "origin_id": "api",
       }
      `);
    });

    it('should reject rendering a Lambda origin whose function was never attached', async () => {
      const { terraform } = createRecordingScope();
      await expect(createLambdaDistribution().toHCL(terraform)).rejects.toThrow(
        'CloudFront origin "api" has nothing attached to it!',
      );
    });

    /**
     * Everything the resource can express at once, none of which any module asks for today: a
     * private bucket next to a custom origin, a fail-over pair over them, a routing table with two
     * ordered behaviors, all three kinds of custom policy, an edge function, and geo blocking.
     */
    it('should render the whole surface', async () => {
      const distribution = createDistribution({
        aliases: ['www.example.com'],
        behaviors: [
          { ...properties().behaviors[0], responseHeadersPolicy: { kind: 'custom', name: 'site-headers' } },
          {
            allowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
            cachedMethods: ['GET', 'HEAD'],
            cachePolicy: { kind: 'managed', name: 'Managed-CachingDisabled' },
            compress: true,
            functionAssociations: [
              {
                arn: 'arn:aws:cloudfront::123456789012:function/rewrite',
                eventType: 'viewer-request',
                kind: 'cloudfront-function',
              },
              {
                arn: 'arn:aws:lambda:us-east-1:123456789012:function:auth:1',
                eventType: 'origin-request',
                kind: 'lambda-edge',
              },
            ],
            originRequestPolicy: { kind: 'custom', name: 'api-forwarding' },
            pathPattern: '/api/*',
            responseHeadersPolicy: null,
            targetOriginId: 'api-group',
            viewerProtocolPolicy: 'https-only',
          },
          {
            ...properties().behaviors[0],
            cachePolicy: { kind: 'custom', name: 'language-aware' },
            pathPattern: '/legacy/*',
            targetOriginId: 'api',
          },
        ],
        cachePolicies: [
          {
            defaultTtl: 3600,
            headers: { kind: 'allowList', values: ['Accept-Language'] },
            maxTtl: 86400,
            minTtl: 0,
            name: 'language-aware',
          },
        ],
        customErrorResponses: [
          { errorCachingMinTtl: 10, errorCode: 403, responseCode: 200, responsePagePath: '/index.html' },
        ],
        geoRestriction: { countries: ['CN', 'RU'], kind: 'block' },
        originGroups: [
          {
            failoverOriginId: 'api',
            failoverStatusCodes: [500, 502, 503, 504],
            originGroupId: 'api-group',
            primaryOriginId: 'website',
          },
        ],
        originRequestPolicies: [
          {
            cookies: { kind: 'all' },
            headers: { kind: 'allowList', values: ['Authorization'] },
            name: 'api-forwarding',
            queryStrings: { kind: 'all' },
          },
        ],
        origins: [
          ...properties().origins,
          {
            connectionAttempts: 3,
            connectionTimeout: 10,
            customHeaders: { 'X-From-CloudFront': 'yes' },
            kind: {
              domainName: 'api.example.com',
              httpPort: 80,
              httpsPort: 443,
              keepaliveTimeout: 5,
              kind: 'custom',
              originProtocolPolicy: 'https-only',
              readTimeout: 30,
              sslProtocols: ['TLSv1.2'],
            },
            originId: 'api',
            originPath: '/v1',
          },
        ],
        priceClass: 'PriceClass_100',
        responseHeadersPolicies: [
          {
            cors: {
              allowCredentials: false,
              allowHeaders: ['*'],
              allowMethods: ['GET', 'HEAD'],
              allowOrigins: ['https://www.example.com'],
              maxAgeSeconds: 600,
            },
            name: 'site-headers',
            securityHeaders: { contentSecurityPolicy: "default-src 'self'" },
          },
        ],
        viewerCertificate: {
          certificateArn: CERTIFICATE_ARN,
          kind: 'acm',
          minimumProtocolVersion: 'TLSv1.2_2021',
        },
      });

      const { emitted, terraform } = createRecordingScope();
      await distribution.toHCL(terraform);

      expect(emitted).toMatchSnapshot();
    });
  });
});
