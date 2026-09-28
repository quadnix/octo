import {
  ATerraformResource,
  type BaseResourceSchema,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  type TerraformModuleScope,
} from '@quadnix/octo';
import { CommonUtility } from '../../utilities/common/common.utility.js';
import { PolicyUtility } from '../../utilities/policy/policy.utility.js';
import {
  type CloudFrontBehaviorSchema,
  CloudFrontDistributionSchema,
  type CloudFrontOriginSchema,
  type CloudFrontResponseHeadersPolicySchema,
  type ICloudFrontPolicyReference,
  type ICloudFrontValueSelection,
} from './index.schema.js';

/**
 * The slice of a terraform module this resource writes into.
 *
 * @internal
 */
type OctoScope = ReturnType<TerraformModuleScope['addOctoTerraformResource']>;

/**
 * The only region CloudFront reads a certificate from, whichever region the origins behind it live
 * in. AWS rejects anything else at apply, so it is worth catching here.
 *
 * @internal
 */
const CLOUD_FRONT_GLOBAL_REGION = 'us-east-1';

/**
 * The longest name AWS accepts for an origin access control.
 *
 * @internal
 */
const ORIGIN_ACCESS_CONTROL_NAME_MAX_LENGTH = 64;

/**
 * What an unset optional field means at render time.
 *
 * A schema default only fires for a value octo instantiated through the schema, and the nested
 * members of `properties` are plain objects a module author wrote by hand. So the renderer supplies
 * its own values rather than trusting a default that would never run - otherwise a policy
 * declared as `{ name: 'x' }`, which the schema says is legal, renders as `undefined`.
 *
 * @internal
 */
const RENDER_DEFAULTS = {
  behavior: {
    allowedMethods: ['GET', 'HEAD'],
    cachedMethods: ['GET', 'HEAD'],
    compress: true,
    functionAssociations: [],
    viewerProtocolPolicy: 'redirect-to-https',
  },
  cachePolicy: { defaultTtl: 86400, enableBrotli: true, enableGzip: true, maxTtl: 31536000, minTtl: 1 },
  errorCachingMinTtl: 10,
  origin: { connectionAttempts: 3, connectionTimeout: 10, customHeaders: {}, originPath: '' },
  securityHeaders: { contentTypeOptions: true, frameOptions: 'SAMEORIGIN', strictTransportSecurityMaxAge: 31536000 },
  valueSelection: { kind: 'none' } as ICloudFrontValueSelection,
} as const;

/**
 * @internal
 */
@Resource<CloudFrontDistribution>('@octo', 'cloudfront-distribution', CloudFrontDistributionSchema)
export class CloudFrontDistribution extends ATerraformResource<CloudFrontDistributionSchema, CloudFrontDistribution> {
  declare parents: MatchingResource<BaseResourceSchema>[];
  declare properties: CloudFrontDistributionSchema['properties'];
  declare response: CloudFrontDistributionSchema['response'];

  /**
   * @internal
   */
  constructor(
    resourceId: string,
    properties: CloudFrontDistributionSchema['properties'],
    parents: MatchingResource<BaseResourceSchema>[] = [],
  ) {
    super(resourceId, properties, parents);

    this.validateReferences();
  }

  /**
   * A name AWS will accept, that still says which thing it belongs to.
   *
   * A distribution's name and an origin's are each free-form, so their join is what overflows a
   * limit neither of them knew about. Cutting the tail off alone would let two origins collide, so
   * what is cut is replaced by a digest of the whole name: two names that differ anywhere still
   * differ here, and the same name always renders the same way.
   *
   * @internal
   */
  private static boundedName(name: string, maxLength: number): string {
    if (name.length <= maxLength) {
      return name;
    }

    const digest = CommonUtility.hash(name).substring(0, 8);
    return `${name.substring(0, maxLength - digest.length - 1)}-${digest}`;
  }

  /**
   * How a policy reference is looked up once every policy has been emitted.
   *
   * @internal
   */
  private static policyKey(slot: string, reference: ICloudFrontPolicyReference): string {
    return `${slot}/${reference.kind}/${reference.name}`;
  }

  /**
   * Nothing about a distribution is force-new. Origins, behaviors, aliases, the certificate, the WAF
   * association - AWS edits all of them in place on a live distribution, so every change is an
   * update. What is left is identity, and the distribution's name is already in the resource id, so
   * only the account can move a distribution to being a different one.
   *
   * @internal
   */
  override async diffProperties(previous: CloudFrontDistribution): Promise<Diff[]> {
    if (previous.properties.awsAccountId !== this.properties.awsAccountId) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'a distribution belongs to one account; a change recreates it',
        ),
      ];
    }

    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [new Diff(this, DiffAction.UPDATE, 'properties', this.properties)];
    }

    return [];
  }

  /**
   * @internal
   */
  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const distributionOctoResource = terraform.addOctoTerraformResource(this as CloudFrontDistribution, {
      provider: { accountId: this.properties.awsAccountId },
    });
    const providerRef = terraform.getProviderAliasRef(this.properties.awsAccountId);

    const policyIdByReference = this.renderPolicies(terraform, distributionOctoResource, providerRef);
    const originAccessControlIdByOriginId = this.renderOriginAccessControls(terraform, distributionOctoResource);

    const distributionTFResource = distributionOctoResource.addTerraformResource(
      'aws_cloudfront_distribution',
      `${this.resourceId}_distribution`,
      {
        ...(this.properties.aliases.length > 0 ? { aliases: this.properties.aliases } : {}),
        comment: this.properties.comment,
        ...(this.properties.customErrorResponses.length > 0
          ? {
              custom_error_response: this.properties.customErrorResponses.map((customErrorResponse) => ({
                error_caching_min_ttl: customErrorResponse.errorCachingMinTtl ?? RENDER_DEFAULTS.errorCachingMinTtl,
                error_code: customErrorResponse.errorCode,
                response_code: customErrorResponse.responseCode,
                response_page_path: customErrorResponse.responsePagePath,
              })),
            }
          : {}),
        default_cache_behavior: this.renderBehavior(this.getDefaultBehavior(), policyIdByReference),
        ...(this.properties.defaultRootObject ? { default_root_object: this.properties.defaultRootObject } : {}),
        enabled: this.properties.enabled,
        http_version: this.properties.httpVersion,
        is_ipv6_enabled: true,
        ...(this.getOrderedBehaviors().length > 0
          ? {
              ordered_cache_behavior: this.getOrderedBehaviors().map((behavior) => ({
                ...this.renderBehavior(behavior, policyIdByReference),
                path_pattern: behavior.pathPattern,
              })),
            }
          : {}),
        origin: this.properties.origins.map((origin) =>
          this.renderOrigin(terraform, origin, originAccessControlIdByOriginId),
        ),
        ...(this.properties.originGroups.length > 0
          ? {
              origin_group: this.properties.originGroups.map((originGroup) => ({
                failover_criteria: { status_codes: originGroup.failoverStatusCodes },
                member: [{ origin_id: originGroup.primaryOriginId }, { origin_id: originGroup.failoverOriginId }],
                origin_id: originGroup.originGroupId,
              })),
            }
          : {}),
        price_class: this.properties.priceClass,
        restrictions: {
          geo_restriction:
            this.properties.geoRestriction.kind === 'none'
              ? { restriction_type: 'none' }
              : {
                  locations: this.properties.geoRestriction.countries,
                  restriction_type: this.properties.geoRestriction.kind === 'allow' ? 'whitelist' : 'blacklist',
                },
        },
        viewer_certificate:
          this.properties.viewerCertificate.kind === 'acm'
            ? {
                acm_certificate_arn: this.properties.viewerCertificate.certificateArn,
                minimum_protocol_version: this.properties.viewerCertificate.minimumProtocolVersion,
                // eslint-disable-next-line spellcheck/spell-checker
                ssl_support_method: 'sni-only',
              }
            : { cloudfront_default_certificate: true },
      },
    );

    distributionOctoResource.output({
      Arn: terraform.raw(`${distributionTFResource.address}.arn`),
      DistributionId: terraform.raw(`${distributionTFResource.address}.id`),
      DomainName: terraform.raw(`${distributionTFResource.address}.domain_name`),
      HostedZoneId: terraform.raw(`${distributionTFResource.address}.hosted_zone_id`),
    });

    if (Object.keys(this.tags).length > 0) {
      distributionTFResource.attribute('tags', this.tags);
    }
  }

  /**
   * Every managed policy a behavior names, paired with the slot it fills.
   *
   * @internal
   */
  private collectManagedPolicyReferences(): [string, ICloudFrontPolicyReference][] {
    const references: [string, ICloudFrontPolicyReference][] = [];

    for (const behavior of this.properties.behaviors) {
      if (behavior.cachePolicy.kind === 'managed') {
        references.push(['cache', behavior.cachePolicy]);
      }
      if (behavior.originRequestPolicy?.kind === 'managed') {
        references.push(['originRequest', behavior.originRequestPolicy]);
      }
      if (behavior.responseHeadersPolicy?.kind === 'managed') {
        references.push(['responseHeaders', behavior.responseHeadersPolicy]);
      }
    }

    return references;
  }

  /**
   * The behavior claiming everything no other behavior did.
   *
   * @internal
   */
  private getDefaultBehavior(): CloudFrontBehaviorSchema {
    return this.properties.behaviors.find((behavior) => !behavior.pathPattern)!;
  }

  /**
   * The behaviors matched, in order, before the default one.
   *
   * @internal
   */
  private getOrderedBehaviors(): CloudFrontBehaviorSchema[] {
    return this.properties.behaviors.filter((behavior) => !!behavior.pathPattern);
  }

  /**
   * @internal
   */
  private renderBehavior(
    behavior: CloudFrontBehaviorSchema,
    policyIdByReference: Map<string, unknown>,
  ): Record<string, unknown> {
    const functionAssociations = behavior.functionAssociations ?? RENDER_DEFAULTS.behavior.functionAssociations;
    const cloudFrontFunctions = functionAssociations.filter((f) => f.kind === 'cloudfront-function');
    const lambdaEdgeFunctions = functionAssociations.filter((f) => f.kind === 'lambda-edge');

    return {
      allowed_methods: behavior.allowedMethods ?? RENDER_DEFAULTS.behavior.allowedMethods,
      cache_policy_id: policyIdByReference.get(CloudFrontDistribution.policyKey('cache', behavior.cachePolicy)),
      cached_methods: behavior.cachedMethods ?? RENDER_DEFAULTS.behavior.cachedMethods,
      compress: behavior.compress ?? RENDER_DEFAULTS.behavior.compress,
      ...(cloudFrontFunctions.length > 0
        ? {
            function_association: cloudFrontFunctions.map((f) => ({
              event_type: f.eventType,
              function_arn: f.arn,
            })),
          }
        : {}),
      ...(lambdaEdgeFunctions.length > 0
        ? {
            lambda_function_association: lambdaEdgeFunctions.map((f) => ({
              event_type: f.eventType,
              lambda_arn: f.arn,
            })),
          }
        : {}),
      ...(behavior.originRequestPolicy
        ? {
            origin_request_policy_id: policyIdByReference.get(
              CloudFrontDistribution.policyKey('originRequest', behavior.originRequestPolicy),
            ),
          }
        : {}),
      ...(behavior.responseHeadersPolicy
        ? {
            response_headers_policy_id: policyIdByReference.get(
              CloudFrontDistribution.policyKey('responseHeaders', behavior.responseHeadersPolicy),
            ),
          }
        : {}),
      target_origin_id: behavior.targetOriginId,
      viewer_protocol_policy: behavior.viewerProtocolPolicy ?? RENDER_DEFAULTS.behavior.viewerProtocolPolicy,
    };
  }

  /**
   * @internal
   */
  private renderOrigin(
    terraform: TerraformModuleScope,
    origin: CloudFrontOriginSchema,
    originAccessControlIdByOriginId: Map<string, unknown>,
  ): Record<string, unknown> {
    const customHeaders = Object.entries(origin.customHeaders ?? RENDER_DEFAULTS.origin.customHeaders);

    return {
      connection_attempts: origin.connectionAttempts ?? RENDER_DEFAULTS.origin.connectionAttempts,
      connection_timeout: origin.connectionTimeout ?? RENDER_DEFAULTS.origin.connectionTimeout,
      ...(customHeaders.length > 0 ? { custom_header: customHeaders.map(([name, value]) => ({ name, value })) } : {}),
      ...(origin.kind.kind === 'custom'
        ? {
            custom_origin_config: {
              http_port: origin.kind.httpPort,
              https_port: origin.kind.httpsPort,
              origin_keepalive_timeout: origin.kind.keepaliveTimeout,
              origin_protocol_policy: origin.kind.originProtocolPolicy,
              origin_read_timeout: origin.kind.readTimeout,
              origin_ssl_protocols: origin.kind.sslProtocols,
            },
          }
        : { origin_access_control_id: originAccessControlIdByOriginId.get(origin.originId) }),
      // An S3 origin's hostname is written down rather than referenced, because the bucket's own
      // policy already references this distribution's ARN. Referencing it back would close a cycle
      // between the two folders, which terragrunt cannot order.
      domain_name:
        origin.kind.kind === 's3'
          ? `${origin.kind.bucketName}.s3.${origin.kind.bucketRegion}.amazonaws.com`
          : origin.kind.source.kind === 'literal'
            ? origin.kind.source.domainName
            : terraform.getRef(
                this.parents.find(
                  (p) =>
                    p.getSchemaInstanceInResourceAction().resourceId ===
                    (origin.kind as { source: { resourceId: string } }).source.resourceId,
                )!,
                origin.kind.source.responseKey,
              ),
      origin_id: origin.originId,
      ...(origin.originPath ? { origin_path: origin.originPath } : {}),
    };
  }

  /**
   * One origin access control per S3 origin. It is what lets the distribution sign its requests to
   * a bucket that admits nothing else.
   *
   * @internal
   */
  private renderOriginAccessControls(
    terraform: TerraformModuleScope,
    distributionOctoResource: OctoScope,
  ): Map<string, unknown> {
    const originAccessControlIdByOriginId = new Map<string, unknown>();

    for (const origin of this.properties.origins) {
      if (origin.kind.kind !== 's3') {
        continue;
      }

      const label = PolicyUtility.getSafeSid(origin.originId);
      const originAccessControlTFResource = distributionOctoResource.addTerraformResource(
        'aws_cloudfront_origin_access_control',
        `${this.resourceId}_origin_access_control_${label}`,
        {
          name: CloudFrontDistribution.boundedName(
            `${this.resourceId}-${origin.originId}`,
            ORIGIN_ACCESS_CONTROL_NAME_MAX_LENGTH,
          ),
          origin_access_control_origin_type: 's3',
          signing_behavior: 'always',
          // eslint-disable-next-line spellcheck/spell-checker
          signing_protocol: 'sigv4',
        },
      );
      originAccessControlIdByOriginId.set(
        origin.originId,
        terraform.raw(`${originAccessControlTFResource.address}.id`),
      );
    }

    return originAccessControlIdByOriginId;
  }

  /**
   * Emits every policy the behaviors reach for, and returns the id expression each reference
   * resolves to.
   *
   * A managed policy is read by name through a `data` block, so the id AWS assigns is never written
   * down here. A custom policy is created, and only the behaviors of this distribution can name it.
   *
   * @internal
   */
  private renderPolicies(
    terraform: TerraformModuleScope,
    distributionOctoResource: OctoScope,
    providerRef: unknown,
  ): Map<string, unknown> {
    const policyIdByReference = new Map<string, unknown>();

    for (const cachePolicy of this.properties.cachePolicies) {
      const tfResource = distributionOctoResource.addTerraformResource(
        'aws_cloudfront_cache_policy',
        `${this.resourceId}_cache_policy_${PolicyUtility.getSafeSid(cachePolicy.name)}`,
        {
          default_ttl: cachePolicy.defaultTtl ?? RENDER_DEFAULTS.cachePolicy.defaultTtl,
          max_ttl: cachePolicy.maxTtl ?? RENDER_DEFAULTS.cachePolicy.maxTtl,
          min_ttl: cachePolicy.minTtl ?? RENDER_DEFAULTS.cachePolicy.minTtl,
          name: cachePolicy.name,
          parameters_in_cache_key_and_forwarded_to_origin: {
            cookies_config: renderCookiesConfig(cachePolicy.cookies),
            enable_accept_encoding_brotli: cachePolicy.enableBrotli ?? RENDER_DEFAULTS.cachePolicy.enableBrotli,
            enable_accept_encoding_gzip: cachePolicy.enableGzip ?? RENDER_DEFAULTS.cachePolicy.enableGzip,
            headers_config: renderHeadersConfig(cachePolicy.headers),
            query_strings_config: renderQueryStringsConfig(cachePolicy.queryStrings),
          },
        },
      );
      policyIdByReference.set(
        CloudFrontDistribution.policyKey('cache', { kind: 'custom', name: cachePolicy.name }),
        terraform.raw(`${tfResource.address}.id`),
      );
    }

    for (const originRequestPolicy of this.properties.originRequestPolicies) {
      const tfResource = distributionOctoResource.addTerraformResource(
        'aws_cloudfront_origin_request_policy',
        `${this.resourceId}_origin_request_policy_${PolicyUtility.getSafeSid(originRequestPolicy.name)}`,
        {
          cookies_config: renderCookiesConfig(originRequestPolicy.cookies),
          headers_config: renderHeadersConfig(originRequestPolicy.headers),
          name: originRequestPolicy.name,
          query_strings_config: renderQueryStringsConfig(originRequestPolicy.queryStrings),
        },
      );
      policyIdByReference.set(
        CloudFrontDistribution.policyKey('originRequest', { kind: 'custom', name: originRequestPolicy.name }),
        terraform.raw(`${tfResource.address}.id`),
      );
    }

    for (const responseHeadersPolicy of this.properties.responseHeadersPolicies) {
      const tfResource = distributionOctoResource.addTerraformResource(
        'aws_cloudfront_response_headers_policy',
        `${this.resourceId}_response_headers_policy_${PolicyUtility.getSafeSid(responseHeadersPolicy.name)}`,
        renderResponseHeadersPolicy(responseHeadersPolicy),
      );
      policyIdByReference.set(
        CloudFrontDistribution.policyKey('responseHeaders', { kind: 'custom', name: responseHeadersPolicy.name }),
        terraform.raw(`${tfResource.address}.id`),
      );
    }

    const managedDataTypes: Record<string, string> = {
      cache: 'aws_cloudfront_cache_policy',
      originRequest: 'aws_cloudfront_origin_request_policy',
      responseHeaders: 'aws_cloudfront_response_headers_policy',
    };
    for (const [slot, reference] of this.collectManagedPolicyReferences()) {
      const key = CloudFrontDistribution.policyKey(slot, reference);
      if (policyIdByReference.has(key)) {
        continue;
      }

      const dataSource = terraform.addTerraformData(
        managedDataTypes[slot],
        `${this.resourceId}_managed_${slot}_${PolicyUtility.getSafeSid(reference.name)}`,
        { name: reference.name, provider: providerRef },
      );
      policyIdByReference.set(key, dataSource.ref('id'));
    }

    return policyIdByReference;
  }

  /**
   * Everything a distribution says about itself that terraform would only reject later, or that AWS
   * would accept and then serve wrongly.
   *
   * @internal
   * @throws If ids collide or do not resolve, if an alias has no certificate to serve it, if the
   * certificate is not one CloudFront can read, if a behavior caches a method it does not allow, or if
   * a CloudFront Function is bound to an event it cannot run on.
   */
  private validateReferences(): void {
    const originIds = this.properties.origins.map((origin) => origin.originId);
    const originGroupIds = this.properties.originGroups.map((originGroup) => originGroup.originGroupId);
    const targetIds = [...originIds, ...originGroupIds];

    // Behaviors and origin groups name origins out of one namespace, so a duplicate would silently
    // resolve to whichever came first.
    const duplicateIds = targetIds.filter((id, index) => targetIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      throw new Error(`CloudFront origin id "${duplicateIds[0]}" is declared more than once!`);
    }

    const s3BucketNames = this.properties.origins
      .filter((origin) => origin.kind.kind === 's3')
      .map((origin) => (origin.kind as { bucketName: string }).bucketName);
    const duplicateBucketNames = s3BucketNames.filter((name, index) => s3BucketNames.indexOf(name) !== index);
    if (duplicateBucketNames.length > 0) {
      throw new Error(`CloudFront bucket "${duplicateBucketNames[0]}" is claimed by more than one origin!`);
    }

    // An S3 origin is reached over HTTPS at `<bucket>.s3.<region>.amazonaws.com`, and the certificate
    // AWS serves there covers one label in front of `s3`. A bucket named with a dot is accepted by
    // every step up to the first request, which then fails the handshake and answers 502.
    const dottedBucketName = s3BucketNames.find((name) => name.includes('.'));
    if (dottedBucketName) {
      throw new Error(`CloudFront cannot reach an S3 origin whose bucket name holds a dot, "${dottedBucketName}"!`);
    }

    for (const originGroup of this.properties.originGroups) {
      for (const memberId of [originGroup.primaryOriginId, originGroup.failoverOriginId]) {
        if (!originIds.includes(memberId)) {
          throw new Error(`CloudFront origin group "${originGroup.originGroupId}" names unknown origin "${memberId}"!`);
        }
      }
    }

    const defaultBehaviors = this.properties.behaviors.filter((behavior) => !behavior.pathPattern);
    if (defaultBehaviors.length !== 1) {
      throw new Error('A CloudFront distribution needs exactly one behavior without a path pattern!');
    }

    const customPolicyNames: Record<string, string[]> = {
      cache: this.properties.cachePolicies.map((p) => p.name),
      originRequest: this.properties.originRequestPolicies.map((p) => p.name),
      responseHeaders: this.properties.responseHeadersPolicies.map((p) => p.name),
    };
    for (const behavior of this.properties.behaviors) {
      if (!targetIds.includes(behavior.targetOriginId)) {
        throw new Error(`CloudFront behavior names unknown origin "${behavior.targetOriginId}"!`);
      }

      const referenced: [string, ICloudFrontPolicyReference | null | undefined][] = [
        ['cache', behavior.cachePolicy],
        ['originRequest', behavior.originRequestPolicy],
        ['responseHeaders', behavior.responseHeadersPolicy],
      ];
      for (const [slot, reference] of referenced) {
        if (reference?.kind === 'custom' && !customPolicyNames[slot].includes(reference.name)) {
          throw new Error(`CloudFront behavior names unknown custom policy "${reference.name}"!`);
        }
      }

      const allowedMethods: readonly string[] = behavior.allowedMethods ?? RENDER_DEFAULTS.behavior.allowedMethods;
      const cachedMethods: readonly string[] = behavior.cachedMethods ?? RENDER_DEFAULTS.behavior.cachedMethods;
      if (!cachedMethods.every((method) => allowedMethods.includes(method))) {
        throw new Error('CloudFront cannot cache a method it does not allow!');
      }

      for (const functionAssociation of behavior.functionAssociations ?? []) {
        if (
          functionAssociation.kind === 'cloudfront-function' &&
          !functionAssociation.eventType.startsWith('viewer-')
        ) {
          throw new Error(
            `A CloudFront Function cannot run on "${functionAssociation.eventType}"! Use Lambda@Edge instead.`,
          );
        }
      }
    }

    if (this.properties.aliases.length > 0 && this.properties.viewerCertificate.kind !== 'acm') {
      throw new Error('A CloudFront alias needs a certificate covering it!');
    }

    // CloudFront reads a certificate from us-east-1 alone, wherever the origins live. Left to AWS,
    // this surfaces as a failed apply rather than as anything a caller can act on.
    if (
      this.properties.viewerCertificate.kind === 'acm' &&
      this.properties.viewerCertificate.certificateArn.split(':')[3] !== CLOUD_FRONT_GLOBAL_REGION
    ) {
      throw new Error(`CloudFront only reads a certificate from "${CLOUD_FRONT_GLOBAL_REGION}"!`);
    }
  }
}

/**
 * @internal
 */
function renderCookiesConfig(input?: ICloudFrontValueSelection): Record<string, unknown> {
  const selection = input ?? RENDER_DEFAULTS.valueSelection;
  return {
    cookie_behavior: cookieBehavior(selection),
    ...(selection.kind === 'allowList' ? { cookies: { items: selection.values } } : {}),
  };
}

/**
 * @internal
 */
function renderHeadersConfig(input?: ICloudFrontValueSelection): Record<string, unknown> {
  const selection = input ?? RENDER_DEFAULTS.valueSelection;
  return {
    header_behavior: headerBehavior(selection),
    ...(selection.kind === 'allowList' ? { headers: { items: selection.values } } : {}),
  };
}

/**
 * @internal
 */
function renderQueryStringsConfig(input?: ICloudFrontValueSelection): Record<string, unknown> {
  const selection = input ?? RENDER_DEFAULTS.valueSelection;
  return {
    query_string_behavior: cookieBehavior(selection),
    ...(selection.kind === 'allowList' ? { query_strings: { items: selection.values } } : {}),
  };
}

/**
 * Cookies and query strings share a vocabulary; headers do not, because only a header selection can
 * mean "everything the viewer sent".
 *
 * @internal
 */
function cookieBehavior(selection: ICloudFrontValueSelection): string {
  switch (selection.kind) {
    case 'all':
    case 'allViewerAndWhitelistCloudFront':
      return 'all';
    case 'allowList':
      return 'whitelist';
    default:
      return 'none';
  }
}

/**
 * @internal
 */
function headerBehavior(selection: ICloudFrontValueSelection): string {
  switch (selection.kind) {
    case 'all':
      return 'allViewer';
    case 'allViewerAndWhitelistCloudFront':
      return 'allViewerAndWhitelistCloudFront';
    case 'allowList':
      return 'whitelist';
    default:
      return 'none';
  }
}

/**
 * @internal
 */
function renderResponseHeadersPolicy(policy: CloudFrontResponseHeadersPolicySchema): Record<string, unknown> {
  const securityHeaders = policy.securityHeaders;

  return {
    ...(policy.cors
      ? {
          cors_config: {
            access_control_allow_credentials: policy.cors.allowCredentials,
            access_control_allow_headers: { items: policy.cors.allowHeaders },
            access_control_allow_methods: { items: policy.cors.allowMethods },
            access_control_allow_origins: { items: policy.cors.allowOrigins },
            access_control_max_age_sec: policy.cors.maxAgeSeconds,
            origin_override: true,
          },
        }
      : {}),
    ...((policy.customHeaders ?? []).length > 0
      ? {
          custom_headers_config: {
            items: (policy.customHeaders ?? []).map((h) => ({
              header: h.header,
              override: h.override,
              value: h.value,
            })),
          },
        }
      : {}),
    name: policy.name,
    ...((policy.removeHeaders ?? []).length > 0
      ? { remove_headers_config: { items: (policy.removeHeaders ?? []).map((header) => ({ header })) } }
      : {}),
    ...(securityHeaders
      ? {
          security_headers_config: {
            ...(securityHeaders.contentSecurityPolicy
              ? {
                  content_security_policy: {
                    content_security_policy: securityHeaders.contentSecurityPolicy,
                    override: true,
                  },
                }
              : {}),
            ...((securityHeaders.contentTypeOptions ?? RENDER_DEFAULTS.securityHeaders.contentTypeOptions)
              ? { content_type_options: { override: true } }
              : {}),
            ...(securityHeaders.frameOptions === null
              ? {}
              : {
                  frame_options: {
                    frame_option: securityHeaders.frameOptions ?? RENDER_DEFAULTS.securityHeaders.frameOptions,
                    override: true,
                  },
                }),
            ...(securityHeaders.referrerPolicy
              ? { referrer_policy: { override: true, referrer_policy: securityHeaders.referrerPolicy } }
              : {}),
            ...(securityHeaders.strictTransportSecurityMaxAge !== null
              ? {
                  strict_transport_security: {
                    access_control_max_age_sec:
                      securityHeaders.strictTransportSecurityMaxAge ??
                      RENDER_DEFAULTS.securityHeaders.strictTransportSecurityMaxAge,
                    // eslint-disable-next-line spellcheck/spell-checker
                    include_subdomains: true,
                    override: true,
                    preload: false,
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}
