import { Schema, Validate } from '@quadnix/octo';

const CLOUDFRONT_CORS_METHODS = ['ALL', 'DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'] as const;
/**
 * An HTTP method a CORS policy may allow. `ALL` allows every method.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontCorsMethod = (typeof CLOUDFRONT_CORS_METHODS)[number];

const CLOUDFRONT_FRAME_OPTIONS = ['DENY', 'SAMEORIGIN'] as const;
/**
 * A value of `X-Frame-Options`.
 * * `DENY` - No site may show the page in a frame, this one included.
 * * `SAMEORIGIN` - Only pages of this site may show the page in a frame.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontFrameOption = (typeof CLOUDFRONT_FRAME_OPTIONS)[number];

/**
 * @internal
 */
export const CLOUDFRONT_MANAGED_CACHE_POLICIES = [
  'Managed-CachingDisabled',
  'Managed-CachingOptimized',
  'Managed-CachingOptimizedForUncompressedObjects',
  'UseOriginCacheControlHeaders',
  'UseOriginCacheControlHeaders-QueryStrings',
] as const;
/**
 * An AWS managed cache policy a behavior may name.
 * [AWS: managed cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html).
 * * `Managed-CachingDisabled` - Caches nothing. For APIs and dynamic apps.
 * * `Managed-CachingOptimized` - Caches for a day by default, keyed on the path alone. For static
 * content.
 * * `Managed-CachingOptimizedForUncompressedObjects` - `Managed-CachingOptimized` for a behavior that
 * does not compress.
 * * `UseOriginCacheControlHeaders` - Caches for as long as the origin's `Cache-Control` says, keyed on
 * the path, `Host`, `Origin`, and every cookie.
 * * `UseOriginCacheControlHeaders-QueryStrings` - `UseOriginCacheControlHeaders`, with the query
 * string in the key too.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontManagedCachePolicy = (typeof CLOUDFRONT_MANAGED_CACHE_POLICIES)[number];

/**
 * @internal
 */
export const CLOUDFRONT_MANAGED_ORIGIN_REQUEST_POLICIES = [
  'Managed-AllViewer',
  'Managed-AllViewerAndCloudFrontHeaders-2022-06',
  'Managed-AllViewerExceptHostHeader',
  'Managed-CORS-CustomOrigin',
  'Managed-CORS-S3Origin',
  'Managed-HostHeaderOnly',
  'Managed-UserAgentRefererHeaders',
] as const;
/**
 * An AWS managed origin request policy a behavior may name.
 * [AWS: managed origin request policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html).
 * * `Managed-AllViewer` - Forwards every header, cookie, and query string the viewer sent. For a
 * load balancer.
 * * `Managed-AllViewerAndCloudFrontHeaders-2022-06` - `Managed-AllViewer`, plus CloudFront's own
 * headers, such as the viewer's country.
 * * `Managed-AllViewerExceptHostHeader` - `Managed-AllViewer` without `Host`. For API Gateway and
 * Lambda function URLs, which reject any host but their own.
 * * `Managed-CORS-CustomOrigin` - Forwards `Origin`, for a custom origin that answers CORS.
 * * `Managed-CORS-S3Origin` - Forwards `Origin` and the CORS request headers, for a bucket that
 * answers CORS.
 * * `Managed-HostHeaderOnly` - Forwards `Host` alone.
 * * `Managed-UserAgentRefererHeaders` - Forwards `User-Agent` and `Referer` alone.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontManagedOriginRequestPolicy = (typeof CLOUDFRONT_MANAGED_ORIGIN_REQUEST_POLICIES)[number];

/**
 * @internal
 */
export const CLOUDFRONT_MANAGED_RESPONSE_HEADERS_POLICIES = [
  'Managed-CORS-and-SecurityHeadersPolicy',
  'Managed-CORS-With-Preflight',
  'Managed-CORS-with-preflight-and-SecurityHeadersPolicy',
  'Managed-SecurityHeadersPolicy',
  'Managed-SimpleCORS',
] as const;
/**
 * An AWS managed response headers policy a behavior may name.
 * [AWS: managed response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-response-headers-policies.html).
 * * `Managed-CORS-and-SecurityHeadersPolicy` - `Managed-SimpleCORS` and `Managed-SecurityHeadersPolicy`
 * together.
 * * `Managed-CORS-With-Preflight` - Allows every origin and every method, answering preflight
 * requests too.
 * * `Managed-CORS-with-preflight-and-SecurityHeadersPolicy` - `Managed-CORS-With-Preflight` and
 * `Managed-SecurityHeadersPolicy` together.
 * * `Managed-SecurityHeadersPolicy` - Adds HSTS for a year, `X-Content-Type-Options: nosniff`,
 * `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, and
 * `X-XSS-Protection: 1; mode=block`. The origin's own values win, except for
 * `X-Content-Type-Options`.
 * * `Managed-SimpleCORS` - Allows every origin, for requests that need no preflight.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontManagedResponseHeadersPolicy = (typeof CLOUDFRONT_MANAGED_RESPONSE_HEADERS_POLICIES)[number];

const CLOUDFRONT_REFERRER_POLICIES = [
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
] as const;
/**
 * A value of `Referrer-Policy`, which decides how much of the page's URL a browser sends in
 * `Referer` when leaving it.
 * * `no-referrer` - Nothing.
 * * `no-referrer-when-downgrade` - The full URL, except from HTTPS to HTTP.
 * * `origin` - Only the origin, e.g. `https://example.com/`.
 * * `origin-when-cross-origin` - The full URL within the site; only the origin to other sites.
 * * `same-origin` - The full URL within the site; nothing to other sites.
 * * `strict-origin` - Only the origin, and nothing from HTTPS to HTTP.
 * * `strict-origin-when-cross-origin` - The full URL within the site; only the origin to other
 * sites, and nothing from HTTPS to HTTP. What browsers do when no policy is sent.
 * * `unsafe-url` - The full URL, always.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontReferrerPolicy = (typeof CLOUDFRONT_REFERRER_POLICIES)[number];

/**
 * Where a behavior reads a cache, origin request, or response headers policy from.
 * * `managed` names one of AWS's own policies, from the list of the slot it fills, e.g.
 * {@link ICloudFrontManagedCachePolicy}.
 * * `custom` names one of the policies this distribution declares in its own properties.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontPolicyReference<M extends string = string> =
  | { kind: 'custom'; name: string }
  | { kind: 'managed'; name: M };

/**
 * Which headers, cookies, or query strings of the viewer's request a policy selects.
 * * `none` - Nothing.
 * * `allowList` - Only the names in `values`, e.g. `['Authorization']`. Names only, never values.
 * * `all` - Everything the viewer sent. Not accepted for a cache policy's `headers`.
 * * `allViewerAndWhitelistCloudFront` - Every header the viewer sent, plus CloudFront's own. Only
 * accepted for an origin request policy's `headers`.
 *
 * Header names are not case-sensitive. Cookie and query string names are, and so are their values:
 * `?lang=en` and `?lang=EN` are two different requests to CloudFront.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontValueSelection =
  | { kind: 'all' | 'allViewerAndWhitelistCloudFront' | 'none' }
  | { kind: 'allowList'; values: string[] };

/**
 * A cache policy this distribution declares, referenced by a behavior under
 * `{ kind: 'custom', name }`. It decides the cache key - what makes two requests different objects -
 * and how long an object stays cached.
 *
 * Everything in the cache key also reaches the origin. With all three TTLs at `0`, nothing is cached.
 * [AWS: cache policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-understand-cache-policy.html).
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontCachePolicySchema {
  /**
   * Which cookies are part of the cache key. See {@link ICloudFrontValueSelection}.
   */
  @Validate({
    destruct: (value: CloudFrontCachePolicySchema['cookies']): ICloudFrontValueSelection[] => [value!],
    options: {
      custom: (value: ICloudFrontValueSelection): boolean =>
        value.kind === 'allowList' ? value.values.length > 0 : ['all', 'none'].includes(value.kind),
    },
  })
  cookies? = Schema<ICloudFrontValueSelection>({ kind: 'none' });

  /**
   * How long an object stays cached when the origin sent neither `Cache-Control` nor `Expires`, in
   * seconds.
   */
  @Validate({ options: { minLength: 0 } })
  defaultTtl? = Schema<number>(86400);

  /**
   * Whether CloudFront caches a brotli-compressed copy for viewers that accept one. A behavior's
   * `compress` serves brotli only when this is `true`.
   */
  enableBrotli? = Schema<boolean>(true);

  /**
   * Whether CloudFront caches a gzip-compressed copy for viewers that accept one. A behavior's
   * `compress` serves gzip only when this is `true`.
   */
  enableGzip? = Schema<boolean>(true);

  /**
   * Which request headers are part of the cache key. See {@link ICloudFrontValueSelection}.
   */
  @Validate({
    destruct: (value: CloudFrontCachePolicySchema['headers']): ICloudFrontValueSelection[] => [value!],
    options: {
      custom: (value: ICloudFrontValueSelection): boolean =>
        value.kind === 'allowList' ? value.values.length > 0 : value.kind === 'none',
    },
  })
  headers? = Schema<ICloudFrontValueSelection>({ kind: 'none' });

  /**
   * The longest an object stays cached when the origin's `Cache-Control` or `Expires` asks for
   * longer, in seconds.
   */
  @Validate({ options: { minLength: 0 } })
  maxTtl? = Schema<number>(31536000);

  /**
   * The shortest an object stays cached, in seconds. Above `0`, it holds even when the origin sends
   * `no-cache`, `no-store`, or `private`.
   */
  @Validate({ options: { minLength: 0 } })
  minTtl? = Schema<number>(1);

  /**
   * How a behavior names this policy. It is also the policy's name in AWS, which must be unique
   * across the account.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  /**
   * Which query strings are part of the cache key. Their order matters too: `?a=1&b=2` and
   * `?b=2&a=1` are cached apart. See {@link ICloudFrontValueSelection}.
   */
  @Validate({
    destruct: (value: CloudFrontCachePolicySchema['queryStrings']): ICloudFrontValueSelection[] => [value!],
    options: {
      custom: (value: ICloudFrontValueSelection): boolean =>
        value.kind === 'allowList' ? value.values.length > 0 : ['all', 'none'].includes(value.kind),
    },
  })
  queryStrings? = Schema<ICloudFrontValueSelection>({ kind: 'none' });
}

/**
 * An origin request policy this distribution declares, referenced by a behavior under
 * `{ kind: 'custom', name }`.
 *
 * It decides what reaches the origin beyond what the cache policy already sends, without adding it
 * to the cache key, e.g. forward the viewer's `Authorization` header without every distinct token
 * becoming its own cache entry.
 * [AWS: origin request policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-request-understand-origin-request-policy.html).
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontOriginRequestPolicySchema {
  /**
   * Which cookies reach the origin. See {@link ICloudFrontValueSelection}.
   */
  @Validate({
    destruct: (value: CloudFrontOriginRequestPolicySchema['cookies']): ICloudFrontValueSelection[] => [value!],
    options: {
      custom: (value: ICloudFrontValueSelection): boolean =>
        value.kind === 'allowList' ? value.values.length > 0 : ['all', 'none'].includes(value.kind),
    },
  })
  cookies? = Schema<ICloudFrontValueSelection>({ kind: 'none' });

  /**
   * Which request headers reach the origin. See {@link ICloudFrontValueSelection}.
   */
  @Validate({
    destruct: (value: CloudFrontOriginRequestPolicySchema['headers']): ICloudFrontValueSelection[] => [value!],
    options: {
      custom: (value: ICloudFrontValueSelection): boolean =>
        value.kind === 'allowList'
          ? value.values.length > 0
          : ['all', 'allViewerAndWhitelistCloudFront', 'none'].includes(value.kind),
    },
  })
  headers? = Schema<ICloudFrontValueSelection>({ kind: 'none' });

  /**
   * How a behavior names this policy. It is also the policy's name in AWS, which must be unique
   * across the account.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  /**
   * Which query strings reach the origin. See {@link ICloudFrontValueSelection}.
   */
  @Validate({
    destruct: (value: CloudFrontOriginRequestPolicySchema['queryStrings']): ICloudFrontValueSelection[] => [value!],
    options: {
      custom: (value: ICloudFrontValueSelection): boolean =>
        value.kind === 'allowList' ? value.values.length > 0 : ['all', 'none'].includes(value.kind),
    },
  })
  queryStrings? = Schema<ICloudFrontValueSelection>({ kind: 'none' });
}

/**
 * The CORS headers a response headers policy adds, which let a page on another origin call this
 * distribution from a browser. They replace any CORS headers the origin sent.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontCorsSchema {
  /**
   * Whether to send `Access-Control-Allow-Credentials: true`, which lets the calling page send
   * cookies and `Authorization`, and read the response. A browser refuses such a response when the
   * allowed origin is `*`, so name the origins in `allowOrigins`.
   */
  allowCredentials = Schema<boolean>();

  /**
   * The request headers the calling page may send, e.g. `['Content-Type', 'Authorization']`.
   * A name may use `*` for any run of characters, e.g. `x-app-*`. `*` alone allows every header
   * except `Authorization`, which must be named. Header names are not case-sensitive.
   */
  @Validate({
    destruct: (value: CloudFrontCorsSchema['allowHeaders']): string[] => value,
    options: { minLength: 1 },
  })
  allowHeaders = Schema<string[]>();

  /**
   * The methods the calling page may use. See {@link ICloudFrontCorsMethod}.
   */
  @Validate({
    destruct: (value: CloudFrontCorsSchema['allowMethods']): string[] => value,
    options: { custom: (value: string): boolean => (CLOUDFRONT_CORS_METHODS as readonly string[]).includes(value) },
  })
  allowMethods = Schema<ICloudFrontCorsMethod[]>();

  /**
   * The origins allowed to call, each a scheme, a host, and a port when it is not the default, e.g.
   * `https://app.example.com`. Write them in lowercase, as browsers send them.
   * * `*` allows every origin.
   * * `*` may stand for the leftmost subdomains, e.g. `https://*.example.com`, which matches
   * `https://www.example.com` and `https://a.b.example.com`, but not `https://example.com`.
   * * `*` may stand for port digits, e.g. `https://example.com:*`.
   * * An origin without a scheme, e.g. `example.com`, matches both `http` and `https`.
   */
  @Validate({
    destruct: (value: CloudFrontCorsSchema['allowOrigins']): string[] => value,
    options: { minLength: 1 },
  })
  allowOrigins = Schema<string[]>();

  /**
   * How long a browser may reuse the answer to a preflight request, in seconds. Browsers cap it:
   * Chrome at `7200`, Firefox at `86400`.
   */
  @Validate({ options: { minLength: 0 } })
  maxAgeSeconds = Schema<number>();
}

/**
 * A header a response headers policy adds to every response.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontCustomHeaderSchema {
  /**
   * The header's name, e.g. `Permissions-Policy`. Not case-sensitive.
   */
  @Validate({ options: { minLength: 1 } })
  header = Schema<string>();

  /**
   * Whether this value replaces one the origin sent under the same name. `false` keeps the
   * origin's value, and adds this one only to responses that have none.
   */
  override = Schema<boolean>();

  /**
   * The header's value, verbatim, e.g. `camera=(), microphone=()`. Whether its case matters is up
   * to the header.
   */
  @Validate({ options: { minLength: 1 } })
  value = Schema<string>();
}

/**
 * The security headers a response headers policy adds. A `null` field adds nothing for that header.
 * Every header set here replaces one the origin sent under the same name.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontSecurityHeadersSchema {
  /**
   * The value of `Content-Security-Policy`, verbatim, e.g.
   * `default-src 'self'; img-src 'self' https://images.example.com`. At most 1783 characters.
   */
  @Validate({
    destruct: (value: CloudFrontSecurityHeadersSchema['contentSecurityPolicy']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  contentSecurityPolicy? = Schema<string | null>(null);

  /**
   * Whether to send `X-Content-Type-Options`, which stops a browser from treating a response as a
   * content type other than the one it declares.
   */
  contentTypeOptions? = Schema<boolean>(true);

  /**
   * The value of `X-Frame-Options`. See {@link ICloudFrontFrameOption}.
   */
  @Validate({
    destruct: (value: CloudFrontSecurityHeadersSchema['frameOptions']): string[] => (value ? [value] : []),
    options: { custom: (value: string): boolean => (CLOUDFRONT_FRAME_OPTIONS as readonly string[]).includes(value) },
  })
  frameOptions? = Schema<ICloudFrontFrameOption | null>('SAMEORIGIN');

  /**
   * The value of `Referrer-Policy`. See {@link ICloudFrontReferrerPolicy}.
   */
  @Validate({
    destruct: (value: CloudFrontSecurityHeadersSchema['referrerPolicy']): string[] => (value ? [value] : []),
    options: {
      custom: (value: string): boolean => (CLOUDFRONT_REFERRER_POLICIES as readonly string[]).includes(value),
    },
  })
  referrerPolicy? = Schema<ICloudFrontReferrerPolicy | null>(null);

  /**
   * The `max-age` of `Strict-Transport-Security`: how long a browser keeps using HTTPS for this host,
   * in seconds. The header also covers every host below this one, and cannot be
   * added to the lists of HTTPS-only hosts that browsers ship with.
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
 * `{ kind: 'custom', name }`. It changes the headers of every response on the way to the viewer,
 * whether it came from the cache or the origin.
 *
 * CloudFront removes `removeHeaders` first, then adds everything else, so a header both removed and
 * added is sent with this policy's value.
 * [AWS: response headers policies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html).
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 */
export class CloudFrontResponseHeadersPolicySchema {
  /**
   * The CORS headers to add. See {@link CloudFrontCorsSchema}.
   */
  @Validate({
    destruct: (value: CloudFrontResponseHeadersPolicySchema['cors']): CloudFrontCorsSchema[] => (value ? [value] : []),
    options: { isSchema: { schema: CloudFrontCorsSchema } },
  })
  cors? = Schema<CloudFrontCorsSchema | null>(null);

  /**
   * Headers to add that have no field of their own, e.g. `Permissions-Policy`.
   * See {@link CloudFrontCustomHeaderSchema}.
   */
  @Validate({
    destruct: (value: CloudFrontResponseHeadersPolicySchema['customHeaders']): CloudFrontCustomHeaderSchema[] => value!,
    options: { isSchema: { schema: CloudFrontCustomHeaderSchema } },
  })
  customHeaders? = Schema<CloudFrontCustomHeaderSchema[]>([]);

  /**
   * How a behavior names this policy. It is also the policy's name in AWS, which must be unique
   * across the account.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  /**
   * Names of headers to strip from the origin's response, e.g. `['Server', 'X-Powered-By']`. Not
   * case-sensitive. With `Server` or `Date` removed, CloudFront sends its own instead.
   *
   * AWS refuses connection-level headers and CloudFront's own, such as `Connection`,
   * `Content-Length`, `Transfer-Encoding`, `Via`, and any header starting `X-Amz-Cf-` or `X-Edge-`.
   * [The full list](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html#remove-headers-disallowed).
   */
  @Validate({
    destruct: (value: CloudFrontResponseHeadersPolicySchema['removeHeaders']): string[] => value!,
    options: { minLength: 1 },
  })
  removeHeaders? = Schema<string[]>([]);

  /**
   * The security headers to add. See {@link CloudFrontSecurityHeadersSchema}.
   */
  @Validate({
    destruct: (value: CloudFrontResponseHeadersPolicySchema['securityHeaders']): CloudFrontSecurityHeadersSchema[] =>
      value ? [value] : [],
    options: { isSchema: { schema: CloudFrontSecurityHeadersSchema } },
  })
  securityHeaders? = Schema<CloudFrontSecurityHeadersSchema | null>(null);
}
