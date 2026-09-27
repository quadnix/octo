import { Schema, Validate } from '@quadnix/octo';
import {
  CLOUDFRONT_MANAGED_CACHE_POLICIES,
  CLOUDFRONT_MANAGED_ORIGIN_REQUEST_POLICIES,
  CLOUDFRONT_MANAGED_RESPONSE_HEADERS_POLICIES,
  type ICloudFrontManagedCachePolicy,
  type ICloudFrontManagedOriginRequestPolicy,
  type ICloudFrontManagedResponseHeadersPolicy,
  type ICloudFrontPolicyReference,
} from './cloudfront-policy.schema.js';

/**
 * Which event in the request lifecycle an edge function runs on.
 * CloudFront Functions may only run on a viewer event; Lambda@Edge may run on any of the four.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontFunctionEventType = 'origin-request' | 'origin-response' | 'viewer-request' | 'viewer-response';

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
   * Which policy decides the cache key and the TTLs. See {@link ICloudFrontPolicyReference}, and
   * {@link ICloudFrontManagedCachePolicy} for the managed ones.
   */
  @Validate({
    options: {
      custom: (value: CloudFrontBehaviorSchema['cachePolicy']): boolean =>
        value.kind === 'managed'
          ? (CLOUDFRONT_MANAGED_CACHE_POLICIES as readonly string[]).includes(value.name)
          : value.kind === 'custom' && value.name.length > 0,
    },
  })
  cachePolicy = Schema<ICloudFrontPolicyReference<ICloudFrontManagedCachePolicy>>();

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
   * See {@link ICloudFrontManagedOriginRequestPolicy} for the managed ones.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['originRequestPolicy']): ICloudFrontPolicyReference[] =>
      value ? [value] : [],
    options: {
      custom: (value: ICloudFrontPolicyReference): boolean =>
        value.kind === 'managed'
          ? (CLOUDFRONT_MANAGED_ORIGIN_REQUEST_POLICIES as readonly string[]).includes(value.name)
          : value.kind === 'custom' && value.name.length > 0,
    },
  })
  originRequestPolicy? = Schema<ICloudFrontPolicyReference<ICloudFrontManagedOriginRequestPolicy> | null>(null);

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
   * content security policy.
   * See {@link ICloudFrontManagedResponseHeadersPolicy} for the managed ones.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['responseHeadersPolicy']): ICloudFrontPolicyReference[] =>
      value ? [value] : [],
    options: {
      custom: (value: ICloudFrontPolicyReference): boolean =>
        value.kind === 'managed'
          ? (CLOUDFRONT_MANAGED_RESPONSE_HEADERS_POLICIES as readonly string[]).includes(value.name)
          : value.kind === 'custom' && value.name.length > 0,
    },
  })
  responseHeadersPolicy? = Schema<ICloudFrontPolicyReference<ICloudFrontManagedResponseHeadersPolicy> | null>(null);

  /**
   * The `originId` or `originGroupId` serving these paths.
   */
  @Validate({ options: { minLength: 1 } })
  targetOriginId = Schema<string>();

  /**
   * What CloudFront does with a plain HTTP request.
   */
  @Validate({ options: { minLength: 1 } })
  viewerProtocolPolicy? = Schema<'allow-all' | 'https-only' | 'redirect-to-https'>('redirect-to-https');
}
