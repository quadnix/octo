import {
  type AModel,
  type Account,
  AccountSchema,
  type Execution,
  Schema,
  type Service,
  ServiceSchema,
  Validate,
} from '@quadnix/octo';
import { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';
import { AwsLambdaFunctionAnchorSchema } from '../../../anchors/aws-lambda/aws-lambda-function.anchor.schema.js';
import {
  CLOUDFRONT_ALLOWED_METHODS,
  CLOUDFRONT_CACHED_METHODS,
  CLOUDFRONT_MANAGED_CACHE_POLICIES,
  CLOUDFRONT_MANAGED_ORIGIN_REQUEST_POLICIES,
  CLOUDFRONT_MANAGED_RESPONSE_HEADERS_POLICIES,
  CLOUDFRONT_PRICE_CLASSES,
  CLOUDFRONT_VIEWER_PROTOCOL_POLICIES,
  CloudFrontCachePolicySchema,
  CloudFrontCustomErrorResponseSchema,
  CloudFrontFunctionAssociationSchema,
  CloudFrontOriginRequestPolicySchema,
  CloudFrontResponseHeadersPolicySchema,
  type ICloudFrontAllowedMethods,
  type ICloudFrontCachedMethods,
  type ICloudFrontManagedCachePolicy,
  type ICloudFrontManagedOriginRequestPolicy,
  type ICloudFrontManagedResponseHeadersPolicy,
  type ICloudFrontPolicyReference,
  type ICloudFrontPriceClass,
  type ICloudFrontViewerProtocolPolicy,
} from '../../../resources/cloudfront-distribution/index.schema.js';

/**
 * One origin the distribution serves from: a source model, and how CloudFront reaches it.
 *
 * @group Modules/Service/AwsCloudFrontService
 *
 * @hideconstructor
 */
export class AwsCloudFrontServiceModuleOriginSchema {
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
   * Headers CloudFront adds to every request it sends to the origin.
   */
  customHeaders? = Schema<{ [name: string]: string }>({});

  /**
   * A name you choose for this origin, e.g. `site`. Routes refer to it. Unique across origins.
   */
  @Validate({ options: { minLength: 1 } })
  originId = Schema<string>();

  /**
   * A path CloudFront prefixes to every request it sends to the origin, e.g. `/public`.
   */
  originPath? = Schema<string>('');

  /**
   * The model to serve. Supported: a bucket produced by `AwsS3StorageServiceModule`, an ALB produced
   * by `AwsEcsAlbServiceModule`, served over HTTP, and a Lambda function produced by
   * `AwsLambdaExecutionModule`, served through its URL. CloudFront waits 60 seconds for the function,
   * so its timeout must be no longer.
   */
  @Validate<unknown>([
    {
      options: {
        custom: (value: AwsCloudFrontServiceModuleOriginSchema['source']): boolean =>
          ['execution', 'service'].includes((value.constructor as typeof AModel).NODE_NAME),
      },
    },
    {
      // A bucket or an ALB; which of the two is checked by the module, since a schema cannot say "either".
      destruct: (value: AwsCloudFrontServiceModuleOriginSchema['source']): Service[] =>
        (value.constructor as typeof AModel).NODE_NAME === 'service' ? [value as Service] : [],
      options: { isModel: { NODE_NAME: 'service' } },
    },
    {
      destruct: (value: AwsCloudFrontServiceModuleOriginSchema['source']): ServiceSchema[] =>
        (value.constructor as typeof AModel).NODE_NAME === 'service' ? [(value as Service).synth()] : [],
      options: { isSchema: { schema: ServiceSchema } },
    },
    {
      destruct: (value: AwsCloudFrontServiceModuleOriginSchema['source']): Execution[] =>
        (value.constructor as typeof AModel).NODE_NAME === 'execution' ? [value as Execution] : [],
      options: {
        isModel: { anchors: [{ schema: AwsLambdaFunctionAnchorSchema }], NODE_NAME: 'execution' },
      },
    },
  ])
  source = Schema<Execution | Service>();
}

/**
 * One route: the paths it claims, the origin serving them, and how CloudFront handles them.
 * Unset settings get defaults that suit the origin's source.
 *
 * @group Modules/Service/AwsCloudFrontService
 *
 * @hideconstructor
 */
export class AwsCloudFrontServiceModuleRouteSchema {
  /**
   * The HTTP methods CloudFront forwards to the origin. For a bucket of static files, `GET` and `HEAD`.
   * See {@link ICloudFrontAllowedMethods} for the sets CloudFront accepts.
   */
  @Validate({
    destruct: (value: AwsCloudFrontServiceModuleRouteSchema['allowedMethods']): string[][] =>
      value ? [[...value]] : [],
    options: {
      custom: (value: string[]): boolean =>
        CLOUDFRONT_ALLOWED_METHODS.some(
          (m) => m.length === value.length && m.every((method) => value.includes(method)),
        ),
    },
  })
  allowedMethods? = Schema<ICloudFrontAllowedMethods | null>(null);

  /**
   * The subset of `allowedMethods` whose responses CloudFront caches. For a bucket of static files,
   * `GET` and `HEAD`. See {@link ICloudFrontCachedMethods} for the sets CloudFront accepts.
   */
  @Validate({
    destruct: (value: AwsCloudFrontServiceModuleRouteSchema['cachedMethods']): string[][] =>
      value ? [[...value]] : [],
    options: {
      custom: (value: string[]): boolean =>
        CLOUDFRONT_CACHED_METHODS.some((m) => m.length === value.length && m.every((method) => value.includes(method))),
    },
  })
  cachedMethods? = Schema<ICloudFrontCachedMethods | null>(null);

  /**
   * Which policy decides the cache key and the TTLs: a managed one by name, e.g.
   * `{ kind: 'managed', name: 'Managed-CachingOptimized' }`, or one of `cachePolicies`. For a static
   * content bucket, `Managed-CachingOptimized`. See {@link ICloudFrontManagedCachePolicy} for the managed
   * ones.
   */
  @Validate({
    destruct: (value: AwsCloudFrontServiceModuleRouteSchema['cachePolicy']): ICloudFrontPolicyReference[] =>
      value ? [value] : [],
    options: {
      custom: (value: ICloudFrontPolicyReference): boolean =>
        value.kind === 'managed'
          ? (CLOUDFRONT_MANAGED_CACHE_POLICIES as readonly string[]).includes(value.name)
          : value.kind === 'custom' && value.name.length > 0,
    },
  })
  cachePolicy? = Schema<ICloudFrontPolicyReference<ICloudFrontManagedCachePolicy> | null>(null);

  /**
   * Whether CloudFront compresses the response for viewers that accept it.
   */
  compress? = Schema<boolean>(true);

  /**
   * Edge functions to run for this route, by ARN. Octo does not create the functions.
   */
  @Validate({
    destruct: (
      value: AwsCloudFrontServiceModuleRouteSchema['functionAssociations'],
    ): CloudFrontFunctionAssociationSchema[] => value!,
    options: { isSchema: { schema: CloudFrontFunctionAssociationSchema } },
  })
  functionAssociations? = Schema<CloudFrontFunctionAssociationSchema[]>([]);

  /**
   * The `originId` of the origin serving these paths.
   */
  @Validate({ options: { minLength: 1 } })
  originId = Schema<string>();

  /**
   * Which policy decides what reaches the origin, independently of the cache key. `null` forwards
   * only what the cache policy selected. See {@link ICloudFrontManagedOriginRequestPolicy} for the
   * managed ones.
   */
  @Validate({
    destruct: (value: AwsCloudFrontServiceModuleRouteSchema['originRequestPolicy']): ICloudFrontPolicyReference[] =>
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
   * The paths this route claims, e.g. `/api/*`. Exactly one route leaves it out: the default route,
   * which claims everything the others do not. The others are matched in the order given, and the
   * first match wins.
   */
  @Validate({
    destruct: (value: AwsCloudFrontServiceModuleRouteSchema['pathPattern']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  pathPattern? = Schema<string | null>(null);

  /**
   * Which policy decides the headers CloudFront adds on the way out, such as CORS or HSTS.
   * See {@link ICloudFrontManagedResponseHeadersPolicy} for the managed ones.
   */
  @Validate({
    destruct: (value: AwsCloudFrontServiceModuleRouteSchema['responseHeadersPolicy']): ICloudFrontPolicyReference[] =>
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
   * What CloudFront does with a plain HTTP request. See {@link ICloudFrontViewerProtocolPolicy}.
   */
  @Validate({
    options: {
      custom: (value: string): boolean => (CLOUDFRONT_VIEWER_PROTOCOL_POLICIES as readonly string[]).includes(value),
    },
  })
  viewerProtocolPolicy? = Schema<ICloudFrontViewerProtocolPolicy>('redirect-to-https');
}

/**
 * `AwsCloudFrontServiceModuleSchema` is the input schema for the `AwsCloudFrontServiceModule` module.
 * It describes one CloudFront distribution: its origins, its routes, its error responses, and the
 * domains and certificate it answers on.
 *
 * @group Modules/Service/AwsCloudFrontService
 *
 * @hideconstructor
 *
 * @see {@link AwsCloudFrontServiceModule} to learn more about the `AwsCloudFrontServiceModule` module.
 */
export class AwsCloudFrontServiceModuleSchema {
  /**
   * The AWS account the distribution is created in.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsAccountAnchorSchema }], NODE_NAME: 'account' },
      },
    },
    {
      destruct: (value: AwsCloudFrontServiceModuleSchema['account']): [AccountSchema] => [value.synth()],
      options: { isSchema: { schema: AccountSchema } },
    },
  ])
  account = Schema<Account>();

  /**
   * The custom domain names the distribution answers on, e.g. `docs.example.com`.
   * Each one needs a DNS record pointing at the distribution, which this module does not create.
   * Leaving this empty serves on the `*.cloudfront.net` domain CloudFront assigns.
   */
  @Validate({
    destruct: (value: AwsCloudFrontServiceModuleSchema['aliases']): string[] => value!,
    options: { minLength: 1 },
  })
  aliases? = Schema<string[]>([]);

  /**
   * Custom cache policies, which routes name as `{ kind: 'custom', name }`.
   */
  @Validate({
    destruct: (value: AwsCloudFrontServiceModuleSchema['cachePolicies']): CloudFrontCachePolicySchema[] => value!,
    options: { isSchema: { schema: CloudFrontCachePolicySchema } },
  })
  cachePolicies? = Schema<CloudFrontCachePolicySchema[]>([]);

  /**
   * The ARN of the ACM certificate covering every entry in `aliases`.
   * CloudFront only reads certificates from `us-east-1`. Required when `aliases` is set.
   */
  @Validate({
    destruct: (value: AwsCloudFrontServiceModuleSchema['certificateArn']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  certificateArn? = Schema<string | null>(null);

  /**
   * The object served for a request to the root, e.g. `index.html`. Empty serves nothing there.
   */
  defaultRootObject? = Schema<string>('');

  /**
   * The name of the distribution. Changing it replaces the distribution.
   */
  @Validate({ options: { minLength: 1 } })
  distributionName = Schema<string>();

  /**
   * What a viewer gets when an origin answers with an error.
   *
   * These apply to the whole distribution, not to one route: a rule answering every `404` with
   * `/index.html` and a `200`, as a single-page app wants, also turns an API's real `404`s into a
   * page of HTML. A distribution serving both should do the single-page-app fallback with an edge
   * function on the website's route instead. A closed bucket reports a missing file as `403`.
   */
  @Validate({
    destruct: (value: AwsCloudFrontServiceModuleSchema['errorResponses']): CloudFrontCustomErrorResponseSchema[] =>
      value!,
    options: { isSchema: { schema: CloudFrontCustomErrorResponseSchema } },
  })
  errorResponses? = Schema<CloudFrontCustomErrorResponseSchema[]>([]);

  /**
   * Custom origin request policies, which routes name as `{ kind: 'custom', name }`.
   */
  @Validate({
    destruct: (
      value: AwsCloudFrontServiceModuleSchema['originRequestPolicies'],
    ): CloudFrontOriginRequestPolicySchema[] => value!,
    options: { isSchema: { schema: CloudFrontOriginRequestPolicySchema } },
  })
  originRequestPolicies? = Schema<CloudFrontOriginRequestPolicySchema[]>([]);

  /**
   * Where the distribution fetches from. See {@link AwsCloudFrontServiceModuleOriginSchema}.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsCloudFrontServiceModuleSchema['origins']): AwsCloudFrontServiceModuleOriginSchema[][] => [
        value,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsCloudFrontServiceModuleSchema['origins']): AwsCloudFrontServiceModuleOriginSchema[] => value,
      options: { isSchema: { schema: AwsCloudFrontServiceModuleOriginSchema } },
    },
  ])
  origins = Schema<AwsCloudFrontServiceModuleOriginSchema[]>();

  /**
   * Which edge locations serve the distribution, which is what it costs. See
   * {@link ICloudFrontPriceClass}.
   */
  @Validate({
    options: { custom: (value: string): boolean => (CLOUDFRONT_PRICE_CLASSES as readonly string[]).includes(value) },
  })
  priceClass? = Schema<ICloudFrontPriceClass>('PriceClass_All');

  /**
   * Custom response headers policies, which routes name as `{ kind: 'custom', name }`.
   */
  @Validate({
    destruct: (
      value: AwsCloudFrontServiceModuleSchema['responseHeadersPolicies'],
    ): CloudFrontResponseHeadersPolicySchema[] => value!,
    options: { isSchema: { schema: CloudFrontResponseHeadersPolicySchema } },
  })
  responseHeadersPolicies? = Schema<CloudFrontResponseHeadersPolicySchema[]>([]);

  /**
   * The routes, each naming an origin. See {@link AwsCloudFrontServiceModuleRouteSchema}.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsCloudFrontServiceModuleSchema['routes']): AwsCloudFrontServiceModuleRouteSchema[][] => [
        value,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: AwsCloudFrontServiceModuleSchema['routes']): AwsCloudFrontServiceModuleRouteSchema[] => value,
      options: { isSchema: { schema: AwsCloudFrontServiceModuleRouteSchema } },
    },
  ])
  routes = Schema<AwsCloudFrontServiceModuleRouteSchema[]>();
}
