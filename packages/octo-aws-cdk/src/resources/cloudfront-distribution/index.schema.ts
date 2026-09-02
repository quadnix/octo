import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * Where a behavior reads a cache, origin request, or response headers policy from.
 * * `managed` names one of AWS's own policies, e.g. `CachingOptimized`. It is looked up by name, so
 * the id AWS assigns is never written down.
 * * `custom` names one of the policies this distribution declares in its own properties.
 *
 * There is deliberately no way to pass a raw policy id. A name is enough for both, and offering two
 * ways to say one thing only makes a caller wonder which is right.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontPolicyReference = { kind: 'custom' | 'managed'; name: string };

/**
 * Where an origin's hostname comes from.
 * * `resource` reads it out of another octo resource's response, which is what makes terraform order
 * the two and what makes terragrunt wire the folders together. `responseKey` names the key holding
 * the hostname, because resources do not agree on what to call it - an ALB publishes `DNSName`, an
 * S3 website bucket publishes `RegionalDomainName`. The module author writes this next to the
 * resource they are pointing at, so it is never an end user's problem.
 * * `literal` is a hostname octo does not manage - a legacy origin, or a third party.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontOriginSource =
  | { domainName: string; kind: 'literal' }
  | { kind: 'resource'; resourceId: string; responseKey: string };

/**
 * How a cache key or an origin request policy selects headers, cookies, or query strings.
 * * `none` selects nothing.
 * * `all` selects everything the viewer sent.
 * * `allViewerAndWhitelistCloudFront` is an origin-request-only selection that forwards everything
 * the viewer sent plus the named CloudFront headers.
 * * `allowList` selects only the named values.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontValueSelection =
  | { kind: 'all' | 'allViewerAndWhitelistCloudFront' | 'none' }
  | { kind: 'allowList'; values: string[] };

/**
 * Which event in the request lifecycle an edge function runs on.
 * CloudFront Functions may only run on a viewer event; Lambda@Edge may run on any of the four.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontFunctionEventType = 'origin-request' | 'origin-response' | 'viewer-request' | 'viewer-response';

/**
 * One origin the distribution can serve from.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontOriginSchema {
  /**
   * How many times CloudFront retries the origin before giving up. Between 1 and 3.
   */
  @Validate({ options: { maxLength: 3, minLength: 1 } })
  connectionAttempts? = Schema<number>(3);

  /**
   * How long CloudFront waits to establish a connection to the origin, in seconds. Between 1 and 10.
   */
  @Validate({ options: { maxLength: 10, minLength: 1 } })
  connectionTimeout? = Schema<number>(10);

  /**
   * Headers CloudFront adds to every request it sends to this origin.
   * This is how a load balancer rejects anything that did not arrive through the distribution.
   */
  @Validate({
    destruct: (value: CloudFrontOriginSchema['customHeaders']): string[] => Object.keys(value!),
    options: { minLength: 1 },
  })
  customHeaders? = Schema<{ [key: string]: string }>({});

  /**
   * What kind of origin this is, and the settings that only apply to that kind.
   *
   * * `s3` is a bucket reached privately. The distribution emits an origin access control for it,
   * and builds the hostname from `bucketName` and `bucketRegion` rather than referencing the bucket,
   * because the bucket's own policy already references this distribution. Granting the distribution
   * read on the bucket is the bucket's job, driven by an overlay.
   * * `custom` is anything that speaks HTTP - a load balancer, an EC2 instance, an API, a third
   * party, or an S3 website endpoint.
   */
  @Validate({
    destruct: (value: CloudFrontOriginSchema['kind']): string[] =>
      value.kind === 's3'
        ? [value.bucketName, value.bucketRegion]
        : [value.originProtocolPolicy, ...value.sslProtocols],
    options: { minLength: 1 },
  })
  kind = Schema<
    | { bucketName: string; bucketRegion: string; kind: 's3' }
    | {
        httpPort: number;
        httpsPort: number;
        keepaliveTimeout: number;
        kind: 'custom';
        originProtocolPolicy: 'http-only' | 'https-only' | 'match-viewer';
        readTimeout: number;
        source: ICloudFrontOriginSource;
        sslProtocols: string[];
      }
  >();

  /**
   * How this origin is named by behaviors and origin groups. Unique across origins and origin groups.
   */
  @Validate({ options: { minLength: 1 } })
  originId = Schema<string>();

  /**
   * A prefix CloudFront prepends to the path before asking the origin for it.
   * Empty asks the origin for the path the viewer requested.
   */
  originPath? = Schema<string>('');
}

/**
 * A primary origin and the origin CloudFront falls back to when the primary answers with one of
 * `failoverStatusCodes`.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontOriginGroupSchema {
  /**
   * The origin id CloudFront falls back to.
   */
  @Validate({ options: { minLength: 1 } })
  failoverOriginId = Schema<string>();

  /**
   * The status codes from the primary origin that trigger the failover.
   */
  @Validate({
    destruct: (value: CloudFrontOriginGroupSchema['failoverStatusCodes']): number[] => value,
    options: { maxLength: 599, minLength: 100 },
  })
  failoverStatusCodes = Schema<number[]>();

  /**
   * How this group is named by behaviors. Unique across origins and origin groups.
   */
  @Validate({ options: { minLength: 1 } })
  originGroupId = Schema<string>();

  /**
   * The origin id CloudFront tries first.
   */
  @Validate({ options: { minLength: 1 } })
  primaryOriginId = Schema<string>();
}

/**
 * An edge function CloudFront runs for a behavior. The function itself is not created here - pass
 * the ARN of one that already exists.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontFunctionAssociationSchema {
  /**
   * The ARN of the CloudFront Function or the Lambda@Edge function version.
   */
  @Validate({ options: { minLength: 1 } })
  arn = Schema<string>();

  /**
   * Which lifecycle event the function runs on. See {@link ICloudFrontFunctionEventType}.
   */
  @Validate({ options: { minLength: 1 } })
  eventType = Schema<ICloudFrontFunctionEventType>();

  /**
   * Which engine runs it. A `cloudfront-function` is JavaScript at the edge and may only bind to a
   * viewer event; `lambda-edge` may bind to any of the four.
   */
  @Validate({ options: { minLength: 1 } })
  kind = Schema<'cloudfront-function' | 'lambda-edge'>();
}

/**
 * One rule binding a set of paths to an origin, and deciding everything about how those paths are
 * served.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontBehaviorSchema {
  /**
   * The HTTP methods CloudFront forwards to the origin.
   * `['GET', 'HEAD']` is a CDN; the full set makes the distribution a reverse proxy.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['allowedMethods']): string[] => value!,
    options: { minLength: 1 },
  })
  allowedMethods? = Schema<string[]>(['GET', 'HEAD']);

  /**
   * The subset of `allowedMethods` whose responses CloudFront caches.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['cachedMethods']): string[] => value!,
    options: { minLength: 1 },
  })
  cachedMethods? = Schema<string[]>(['GET', 'HEAD']);

  /**
   * Which policy decides the cache key and the TTLs. See {@link ICloudFrontPolicyReference}.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['cachePolicy']): string[] => [value.kind, value.name],
    options: { minLength: 1 },
  })
  cachePolicy = Schema<ICloudFrontPolicyReference>();

  /**
   * Whether CloudFront compresses the response for viewers that accept it.
   */
  compress? = Schema<boolean>(true);

  /**
   * Edge functions to run for this behavior. See {@link CloudFrontFunctionAssociationSchema}.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['functionAssociations']): CloudFrontFunctionAssociationSchema[] =>
      value!,
    options: { isSchema: { schema: CloudFrontFunctionAssociationSchema } },
  })
  functionAssociations? = Schema<CloudFrontFunctionAssociationSchema[]>([]);

  /**
   * Which policy decides what reaches the origin, independently of the cache key.
   * `null` forwards only what the cache policy already selected.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['originRequestPolicy']): string[] =>
      value ? [value.kind, value.name] : [],
    options: { minLength: 1 },
  })
  originRequestPolicy? = Schema<ICloudFrontPolicyReference | null>(null);

  /**
   * The paths this behavior claims, e.g. `/api/*`. Absent on the default behavior, which claims
   * everything no other behavior did.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['pathPattern']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  pathPattern? = Schema<string | null>(null);

  /**
   * Which policy decides the headers CloudFront adds on the way out - CORS, HSTS, and the app's own
   * content security policy. `null` adds nothing.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['responseHeadersPolicy']): string[] =>
      value ? [value.kind, value.name] : [],
    options: { minLength: 1 },
  })
  responseHeadersPolicy? = Schema<ICloudFrontPolicyReference | null>(null);

  /**
   * The origin or origin group serving these paths.
   */
  @Validate({ options: { minLength: 1 } })
  targetOriginId = Schema<string>();

  /**
   * What CloudFront does with a plain HTTP request.
   */
  @Validate({ options: { minLength: 1 } })
  viewerProtocolPolicy? = Schema<'allow-all' | 'https-only' | 'redirect-to-https'>('redirect-to-https');
}

/**
 * What the viewer gets when the origin answers with a status code CloudFront was told to handle.
 *
 * The same field set expresses opposite intents. A single-page app maps `403` and `404` to a `200`
 * carrying `/index.html` with a short TTL, so the client-side router can take over; a content site
 * maps them to a real `404` carrying an error page.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontCustomErrorResponseSchema {
  /**
   * How long CloudFront caches this error before asking the origin again, in seconds.
   */
  @Validate({ options: { minLength: 0 } })
  errorCachingMinTtl? = Schema<number>(10);

  /**
   * The status code the origin answered with.
   */
  @Validate({ options: { maxLength: 599, minLength: 100 } })
  errorCode = Schema<number>();

  /**
   * The status code the viewer sees.
   */
  @Validate({ options: { maxLength: 599, minLength: 100 } })
  responseCode = Schema<number>();

  /**
   * The object served in place of the error, e.g. `/index.html`.
   */
  @Validate({ options: { minLength: 1 } })
  responsePagePath = Schema<string>();
}

/**
 * A cache policy this distribution declares, referenced by a behavior under
 * `{ kind: 'custom', name }`.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontCachePolicySchema {
  /**
   * Which cookies are part of the cache key.
   */
  @Validate({
    destruct: (value: CloudFrontCachePolicySchema['cookies']): string[] => [value!.kind],
    options: { minLength: 1 },
  })
  cookies? = Schema<ICloudFrontValueSelection>({ kind: 'none' });

  /**
   * How long CloudFront serves an object without asking the origin, when the origin sent no
   * caching headers of its own. In seconds.
   */
  @Validate({ options: { minLength: 0 } })
  defaultTtl? = Schema<number>(86400);

  /**
   * Whether CloudFront may store and serve a brotli-compressed copy.
   */
  enableBrotli? = Schema<boolean>(true);

  /**
   * Whether CloudFront may store and serve a gzip-compressed copy.
   */
  enableGzip? = Schema<boolean>(true);

  /**
   * Which request headers are part of the cache key.
   */
  @Validate({
    destruct: (value: CloudFrontCachePolicySchema['headers']): string[] => [value!.kind],
    options: { minLength: 1 },
  })
  headers? = Schema<ICloudFrontValueSelection>({ kind: 'none' });

  /**
   * The longest CloudFront will serve an object without asking the origin, whatever the origin's
   * own caching headers said. In seconds.
   */
  @Validate({ options: { minLength: 0 } })
  maxTtl? = Schema<number>(31536000);

  /**
   * The shortest CloudFront will serve an object without asking the origin. In seconds.
   */
  @Validate({ options: { minLength: 0 } })
  minTtl? = Schema<number>(1);

  /**
   * How a behavior names this policy.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  /**
   * Which query strings are part of the cache key.
   */
  @Validate({
    destruct: (value: CloudFrontCachePolicySchema['queryStrings']): string[] => [value!.kind],
    options: { minLength: 1 },
  })
  queryStrings? = Schema<ICloudFrontValueSelection>({ kind: 'none' });
}

/**
 * An origin request policy this distribution declares, referenced by a behavior under
 * `{ kind: 'custom', name }`.
 *
 * This is what reaches the origin, and it is separate from the cache key on purpose: an origin can
 * be told the viewer's `Authorization` header without every distinct token becoming its own cache
 * entry.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontOriginRequestPolicySchema {
  /**
   * Which cookies reach the origin.
   */
  @Validate({
    destruct: (value: CloudFrontOriginRequestPolicySchema['cookies']): string[] => [value!.kind],
    options: { minLength: 1 },
  })
  cookies? = Schema<ICloudFrontValueSelection>({ kind: 'none' });

  /**
   * Which request headers reach the origin.
   */
  @Validate({
    destruct: (value: CloudFrontOriginRequestPolicySchema['headers']): string[] => [value!.kind],
    options: { minLength: 1 },
  })
  headers? = Schema<ICloudFrontValueSelection>({ kind: 'none' });

  /**
   * How a behavior names this policy.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  /**
   * Which query strings reach the origin.
   */
  @Validate({
    destruct: (value: CloudFrontOriginRequestPolicySchema['queryStrings']): string[] => [value!.kind],
    options: { minLength: 1 },
  })
  queryStrings? = Schema<ICloudFrontValueSelection>({ kind: 'none' });
}

/**
 * The security headers a response headers policy adds. Every field is optional; a `null` field adds
 * nothing for that header.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontSecurityHeadersSchema {
  /**
   * The app's own content security policy, verbatim.
   */
  @Validate({
    destruct: (value: CloudFrontSecurityHeadersSchema['contentSecurityPolicy']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  contentSecurityPolicy? = Schema<string | null>(null);

  /**
   * Whether to send `X-Content-Type-Options`, which tells a browser to trust the declared content
   * type rather than guessing one from the bytes.
   */
  contentTypeOptions? = Schema<boolean>(true);

  /**
   * The value of `X-Frame-Options`, or `null` to send none.
   */
  @Validate({
    destruct: (value: CloudFrontSecurityHeadersSchema['frameOptions']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  frameOptions? = Schema<'DENY' | 'SAMEORIGIN' | null>('SAMEORIGIN');

  /**
   * The value of `Referrer-Policy`, or `null` to send none.
   */
  @Validate({
    destruct: (value: CloudFrontSecurityHeadersSchema['referrerPolicy']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  referrerPolicy? = Schema<string | null>(null);

  /**
   * How long a viewer should keep using HTTPS for this host, in seconds. `null` sends no
   * `Strict-Transport-Security` header at all.
   */
  @Validate({
    destruct: (value: CloudFrontSecurityHeadersSchema['strictTransportSecurityMaxAge']): number[] =>
      value === null || value === undefined ? [] : [value],
    options: { minLength: 0 },
  })
  strictTransportSecurityMaxAge? = Schema<number | null>(31536000);
}

/**
 * A response headers policy this distribution declares, referenced by a behavior under
 * `{ kind: 'custom', name }`.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontResponseHeadersPolicySchema {
  /**
   * A cross-origin resource sharing configuration, or `null` for none.
   */
  @Validate({
    destruct: (value: CloudFrontResponseHeadersPolicySchema['cors']): string[] =>
      value ? [...value.allowHeaders, ...value.allowMethods, ...value.allowOrigins] : [],
    options: { minLength: 1 },
  })
  cors? = Schema<{
    allowCredentials: boolean;
    allowHeaders: string[];
    allowMethods: string[];
    allowOrigins: string[];
    maxAgeSeconds: number;
  } | null>(null);

  /**
   * Headers CloudFront adds verbatim. `override` decides what happens when the origin already sent
   * one of the same name.
   */
  @Validate({
    destruct: (value: CloudFrontResponseHeadersPolicySchema['customHeaders']): string[] =>
      value!.flatMap((v) => [v.header, v.value]),
    options: { minLength: 1 },
  })
  customHeaders? = Schema<{ header: string; override: boolean; value: string }[]>([]);

  /**
   * How a behavior names this policy.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  /**
   * Headers CloudFront strips from the origin's response before the viewer sees it.
   */
  @Validate({
    destruct: (value: CloudFrontResponseHeadersPolicySchema['removeHeaders']): string[] => value!,
    options: { minLength: 1 },
  })
  removeHeaders? = Schema<string[]>([]);

  /**
   * The security headers to add, or `null` to add none.
   * See {@link CloudFrontSecurityHeadersSchema}.
   */
  @Validate({
    destruct: (value: CloudFrontResponseHeadersPolicySchema['securityHeaders']): CloudFrontSecurityHeadersSchema[] =>
      value ? [value] : [],
    options: { isSchema: { schema: CloudFrontSecurityHeadersSchema } },
  })
  securityHeaders? = Schema<CloudFrontSecurityHeadersSchema | null>(null);
}

/**
 * The `CloudFrontDistributionSchema` class is the schema for the `CloudFrontDistribution` resource,
 * which represents an AWS CloudFront distribution. Terraform provisions it as
 * [`aws_cloudfront_distribution`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution),
 * alongside an
 * [`aws_cloudfront_origin_access_control`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control)
 * per S3 origin and one terraform resource per policy the distribution declares.
 *
 * The distribution is deliberately open. It carries several origins of mixed kinds, a routing table
 * of behaviors over them, and the security layer around both, so that one module can serve a
 * single-page app out of a bucket while another puts the same resource in front of a load balancer.
 * The opinion about which of those a caller gets belongs to the module, not here.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 *
 * @overrideProperty parents - Every managed origin that is not an S3 bucket. The distribution reads
 * such an origin's hostname out of its response, so it is a child of it. An S3 origin runs the other
 * way - the bucket's policy has to name this distribution's ARN, which AWS assigns, so the bucket is
 * the child and this distribution writes the bucket's hostname literally.
 * ```mermaid
 * graph TD;
 *   origin((Origin<br>Resource)) --> cloudfront_distribution((CloudFront<br>Distribution))
 *   cloudfront_distribution --> s3_bucket((S3<br>Bucket))
 * ```
 * @overrideProperty resourceId - The resource id is of format `cloudfront-<distribution-name>`.
 * There is no region in it: CloudFront is global, and the provider is found on the account alone.
 */
export class CloudFrontDistributionSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.aliases` - The custom domain names the distribution answers on. Each one needs a
   * DNS record pointing at the distribution, which this resource does not create. Empty serves only
   * the `*.cloudfront.net` domain CloudFront assigns.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.behaviors` - The routing table. Exactly one entry has no `pathPattern` and is the
   * default behavior; the rest are matched in order before it.
   * See {@link CloudFrontBehaviorSchema}.
   * * `properties.cachePolicies` - Cache policies this distribution declares.
   * See {@link CloudFrontCachePolicySchema}.
   * * `properties.comment` - A human-readable label. It is the only name a distribution carries in
   * the console.
   * * `properties.customErrorResponses` - What the viewer gets for an origin error.
   * See {@link CloudFrontCustomErrorResponseSchema}.
   * * `properties.defaultRootObject` - The object served for a request to the site root.
   * * `properties.distributionName` - What names this distribution. Part of its identity.
   * * `properties.enabled` - Whether the distribution serves traffic. Disabling is also the first
   * half of deleting one, which AWS makes a slow operation.
   * * `properties.geoRestriction` - Which countries may reach the distribution.
   * * `properties.httpVersion` - The newest HTTP version viewers may negotiate.
   * * `properties.isIpv6Enabled` - Whether the distribution answers over IP version 6.
   * * `properties.logging` - Where CloudFront writes its access logs, or `null` for none. The bucket
   * is not created here.
   * * `properties.originGroups` - Fail-over pairs over the origins.
   * See {@link CloudFrontOriginGroupSchema}.
   * * `properties.originRequestPolicies` - Origin request policies this distribution declares.
   * See {@link CloudFrontOriginRequestPolicySchema}.
   * * `properties.origins` - Where content comes from. See {@link CloudFrontOriginSchema}.
   * * `properties.priceClass` - Which edge locations serve the traffic, which is what the
   * distribution costs. `PriceClass_100` is North America and Europe alone.
   * * `properties.responseHeadersPolicies` - Response headers policies this distribution declares.
   * See {@link CloudFrontResponseHeadersPolicySchema}.
   * * `properties.viewerCertificate` - The certificate viewers see. `default` serves CloudFront's
   * own, which is valid only for the assigned `*.cloudfront.net` domain; `acm` serves a certificate
   * of yours, which CloudFront reads from `us-east-1` alone.
   * * `properties.webAclArn` - The web ACL guarding the distribution, or `null` for none. The
   * ACL is not created here, and CloudFront reads it from `us-east-1` alone.
   */
  @Validate<unknown>([
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): string[] => [
        ...value.aliases,
        value.awsAccountId,
        value.distributionName,
        value.httpVersion,
        value.priceClass,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): CloudFrontOriginSchema[] => value.origins,
      options: { isSchema: { schema: CloudFrontOriginSchema } },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): CloudFrontOriginGroupSchema[] =>
        value.originGroups,
      options: { isSchema: { schema: CloudFrontOriginGroupSchema } },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): CloudFrontBehaviorSchema[] => value.behaviors,
      options: { isSchema: { schema: CloudFrontBehaviorSchema } },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): CloudFrontCustomErrorResponseSchema[] =>
        value.customErrorResponses,
      options: { isSchema: { schema: CloudFrontCustomErrorResponseSchema } },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): CloudFrontCachePolicySchema[] =>
        value.cachePolicies,
      options: { isSchema: { schema: CloudFrontCachePolicySchema } },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): CloudFrontOriginRequestPolicySchema[] =>
        value.originRequestPolicies,
      options: { isSchema: { schema: CloudFrontOriginRequestPolicySchema } },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): CloudFrontResponseHeadersPolicySchema[] =>
        value.responseHeadersPolicies,
      options: { isSchema: { schema: CloudFrontResponseHeadersPolicySchema } },
    },
  ])
  override properties = Schema<{
    aliases: string[];
    awsAccountId: string;
    behaviors: CloudFrontBehaviorSchema[];
    cachePolicies: CloudFrontCachePolicySchema[];
    comment: string;
    customErrorResponses: CloudFrontCustomErrorResponseSchema[];
    defaultRootObject: string;
    distributionName: string;
    enabled: boolean;
    geoRestriction: { countries: string[]; kind: 'allow' | 'block' } | { kind: 'none' };
    httpVersion: 'http1.1' | 'http2' | 'http2and3';
    isIpv6Enabled: boolean;
    logging: { bucketDomainName: string; includeCookies: boolean; prefix: string } | null;
    originGroups: CloudFrontOriginGroupSchema[];
    originRequestPolicies: CloudFrontOriginRequestPolicySchema[];
    origins: CloudFrontOriginSchema[];
    priceClass: 'PriceClass_100' | 'PriceClass_200' | 'PriceClass_All';
    responseHeadersPolicies: CloudFrontResponseHeadersPolicySchema[];
    viewerCertificate: { certificateArn: string; kind: 'acm'; minimumProtocolVersion: string } | { kind: 'default' };
    webAclArn: string | null;
  }>();

  /**
   * Saved response.
   * * `response.Arn` - The ARN of the distribution. A bucket admitting this distribution names it.
   * * `response.DistributionId` - The distribution id, which is what an invalidation is issued against.
   * * `response.DomainName` - The `*.cloudfront.net` domain CloudFront assigned. Point a DNS record
   * at this.
   * * `response.HostedZoneId` - The zone a Route 53 alias record pointing at this distribution needs.
   * It is the same constant for every CloudFront distribution, and it is published here so that a
   * DNS module never has to know that.
   */
  @Validate({
    destruct: (value: CloudFrontDistributionSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      if (value.DistributionId) {
        subjects.push(value.DistributionId);
      }
      if (value.DomainName) {
        subjects.push(value.DomainName);
      }
      if (value.HostedZoneId) {
        subjects.push(value.HostedZoneId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    Arn?: string;
    DistributionId?: string;
    DomainName?: string;
    HostedZoneId?: string;
  }>({
    Arn: 'arn:aws:cloudfront::000000000000:distribution/E000000000000',
    DistributionId: 'E000000000000',
    DomainName: 'd000000000000.cloudfront.net',
    HostedZoneId: 'Z2FDTNDATAQYW2',
  });
}
