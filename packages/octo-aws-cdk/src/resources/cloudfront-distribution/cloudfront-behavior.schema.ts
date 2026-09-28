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
 * @internal
 */
export const CLOUDFRONT_ALLOWED_METHODS = [
  ['GET', 'HEAD'],
  ['GET', 'HEAD', 'OPTIONS'],
  ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
] as const;
/**
 * The HTTP methods CloudFront forwards to the origin. CloudFront accepts these three sets alone. The
 * type lists each in the order AWS does; validation accepts any order.
 * * `['GET', 'HEAD']` - A CDN of static files.
 * * `['GET', 'HEAD', 'OPTIONS']` - Static files, plus CORS preflight requests.
 * * `['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE']` - A reverse proxy in front of an API.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontAllowedMethods = (typeof CLOUDFRONT_ALLOWED_METHODS)[number];

/**
 * @internal
 */
export const CLOUDFRONT_CACHED_METHODS = [
  ['GET', 'HEAD'],
  ['GET', 'HEAD', 'OPTIONS'],
] as const;
/**
 * The HTTP methods whose responses CloudFront caches. CloudFront accepts these two sets alone, and
 * the set must be within the allowed methods. Validation accepts any order.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontCachedMethods = (typeof CLOUDFRONT_CACHED_METHODS)[number];

const CLOUDFRONT_FUNCTION_EVENT_TYPES = [
  'origin-request',
  'origin-response',
  'viewer-request',
  'viewer-response',
] as const;
/**
 * Which event in the request lifecycle an edge function runs on.
 * CloudFront Functions may only run on a viewer event; Lambda@Edge may run on any of the four.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontFunctionEventType = (typeof CLOUDFRONT_FUNCTION_EVENT_TYPES)[number];

const CLOUDFRONT_FUNCTION_KINDS = ['cloudfront-function', 'lambda-edge'] as const;
/**
 * Which engine runs an edge function.
 * * `cloudfront-function` - JavaScript at the edge. It may only bind to a viewer event.
 * * `lambda-edge` - Lambda@Edge. It may bind to any of the four events.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontFunctionKind = (typeof CLOUDFRONT_FUNCTION_KINDS)[number];

/**
 * @internal
 */
export const CLOUDFRONT_VIEWER_PROTOCOL_POLICIES = ['allow-all', 'https-only', 'redirect-to-https'] as const;
/**
 * What CloudFront does with a plain HTTP request.
 * * `allow-all` - Serves it over HTTP.
 * * `https-only` - Refuses it with a `403`.
 * * `redirect-to-https` - Redirects it to HTTPS with a `301`.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontViewerProtocolPolicy = (typeof CLOUDFRONT_VIEWER_PROTOCOL_POLICIES)[number];

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
  @Validate({
    options: {
      custom: (value: string): boolean => (CLOUDFRONT_FUNCTION_EVENT_TYPES as readonly string[]).includes(value),
    },
  })
  eventType = Schema<ICloudFrontFunctionEventType>();

  /**
   * Which engine runs it. See {@link ICloudFrontFunctionKind}.
   */
  @Validate({
    options: { custom: (value: string): boolean => (CLOUDFRONT_FUNCTION_KINDS as readonly string[]).includes(value) },
  })
  kind = Schema<ICloudFrontFunctionKind>();
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
   * The HTTP methods CloudFront forwards to the origin. See {@link ICloudFrontAllowedMethods}.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['allowedMethods']): string[][] => [[...value!]],
    options: {
      custom: (value: string[]): boolean =>
        CLOUDFRONT_ALLOWED_METHODS.some(
          (m) => m.length === value.length && m.every((method) => value.includes(method)),
        ),
    },
  })
  allowedMethods? = Schema<ICloudFrontAllowedMethods>(['GET', 'HEAD']);

  /**
   * The subset of `allowedMethods` whose responses CloudFront caches. See
   * {@link ICloudFrontCachedMethods}.
   */
  @Validate({
    destruct: (value: CloudFrontBehaviorSchema['cachedMethods']): string[][] => [[...value!]],
    options: {
      custom: (value: string[]): boolean =>
        CLOUDFRONT_CACHED_METHODS.some((m) => m.length === value.length && m.every((method) => value.includes(method))),
    },
  })
  cachedMethods? = Schema<ICloudFrontCachedMethods>(['GET', 'HEAD']);

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
   * What CloudFront does with a plain HTTP request. See {@link ICloudFrontViewerProtocolPolicy}.
   */
  @Validate({
    options: {
      custom: (value: string): boolean => (CLOUDFRONT_VIEWER_PROTOCOL_POLICIES as readonly string[]).includes(value),
    },
  })
  viewerProtocolPolicy? = Schema<ICloudFrontViewerProtocolPolicy>('redirect-to-https');
}
