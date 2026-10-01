import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';
import {
  CLOUDFRONT_ALLOWED_METHODS,
  CLOUDFRONT_CACHED_METHODS,
  CLOUDFRONT_VIEWER_PROTOCOL_POLICIES,
  CloudFrontBehaviorSchema,
  CloudFrontFunctionAssociationSchema,
  type ICloudFrontAllowedMethods,
  type ICloudFrontCachedMethods,
  type ICloudFrontFunctionEventType,
  type ICloudFrontFunctionKind,
  type ICloudFrontViewerProtocolPolicy,
} from './cloudfront-behavior.schema.js';
import { CloudFrontOriginGroupSchema, CloudFrontOriginSchema } from './cloudfront-origin.schema.js';
import {
  CLOUDFRONT_MANAGED_CACHE_POLICIES,
  CLOUDFRONT_MANAGED_ORIGIN_REQUEST_POLICIES,
  CLOUDFRONT_MANAGED_RESPONSE_HEADERS_POLICIES,
  CloudFrontCachePolicySchema,
  CloudFrontCorsSchema,
  CloudFrontCustomHeaderSchema,
  CloudFrontOriginRequestPolicySchema,
  CloudFrontResponseHeadersPolicySchema,
  CloudFrontSecurityHeadersSchema,
  type ICloudFrontCorsMethod,
  type ICloudFrontFrameOption,
  type ICloudFrontManagedCachePolicy,
  type ICloudFrontManagedOriginRequestPolicy,
  type ICloudFrontManagedResponseHeadersPolicy,
  type ICloudFrontPolicyReference,
  type ICloudFrontReferrerPolicy,
  type ICloudFrontValueSelection,
} from './cloudfront-policy.schema.js';
import { CloudFrontCustomErrorResponseSchema } from './cloudfront-response.schema.js';

export {
  CLOUDFRONT_ALLOWED_METHODS,
  CLOUDFRONT_CACHED_METHODS,
  CLOUDFRONT_MANAGED_CACHE_POLICIES,
  CLOUDFRONT_MANAGED_ORIGIN_REQUEST_POLICIES,
  CLOUDFRONT_MANAGED_RESPONSE_HEADERS_POLICIES,
  CLOUDFRONT_VIEWER_PROTOCOL_POLICIES,
  CloudFrontBehaviorSchema,
  CloudFrontCachePolicySchema,
  CloudFrontCorsSchema,
  CloudFrontCustomErrorResponseSchema,
  CloudFrontCustomHeaderSchema,
  CloudFrontFunctionAssociationSchema,
  CloudFrontOriginGroupSchema,
  CloudFrontOriginRequestPolicySchema,
  CloudFrontOriginSchema,
  CloudFrontResponseHeadersPolicySchema,
  CloudFrontSecurityHeadersSchema,
};
export type {
  ICloudFrontAllowedMethods,
  ICloudFrontCachedMethods,
  ICloudFrontCorsMethod,
  ICloudFrontFrameOption,
  ICloudFrontFunctionEventType,
  ICloudFrontFunctionKind,
  ICloudFrontManagedCachePolicy,
  ICloudFrontManagedOriginRequestPolicy,
  ICloudFrontManagedResponseHeadersPolicy,
  ICloudFrontPolicyReference,
  ICloudFrontReferrerPolicy,
  ICloudFrontValueSelection,
  ICloudFrontViewerProtocolPolicy,
};

const CLOUDFRONT_HTTP_VERSIONS = ['http1.1', 'http2', 'http2and3'] as const;
/**
 * The newest HTTP version viewers may negotiate. A viewer that cannot speak it falls back to an older
 * one.
 * * `http1.1` - HTTP/1.1 alone.
 * * `http2` - HTTP/2, for viewers with TLS 1.2 and SNI.
 * * `http2and3` - HTTP/3 as well, for viewers with TLS 1.3.
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontHttpVersion = (typeof CLOUDFRONT_HTTP_VERSIONS)[number];

/* eslint-disable spellcheck/spell-checker */
const CLOUDFRONT_MINIMUM_PROTOCOL_VERSIONS = [
  'TLSv1',
  'TLSv1.1_2016',
  'TLSv1.2_2018',
  'TLSv1.2_2019',
  'TLSv1.2_2021',
  'TLSv1.2_2025',
  'TLSv1.3_2025',
  'TLSv1_2016',
] as const;
/* eslint-enable spellcheck/spell-checker */
/**
 * The oldest TLS version a viewer may connect with, and, through the year, which ciphers CloudFront
 * offers. `TLSv1.2_2021` suits a site with no viewers on old devices.
 * [AWS: protocols and ciphers per policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/secure-connections-supported-viewer-protocols-ciphers.html).
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontMinimumProtocolVersion = (typeof CLOUDFRONT_MINIMUM_PROTOCOL_VERSIONS)[number];

/**
 * @internal
 */
export const CLOUDFRONT_PRICE_CLASSES = ['PriceClass_100', 'PriceClass_200', 'PriceClass_All'] as const;
/**
 * Which edge locations serve the distribution, which sets what it costs. A viewer outside the chosen
 * locations is served from the nearest one inside them, more slowly.
 * * `PriceClass_100` - North America and Europe. The cheapest.
 * * `PriceClass_200` - `PriceClass_100`, plus most of Asia, the Middle East, and Africa.
 * * `PriceClass_All` - Every edge location.
 *
 * [AWS: price classes](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PriceClass.html).
 *
 * @group Resources/CloudFrontDistribution
 */
export type ICloudFrontPriceClass = (typeof CLOUDFRONT_PRICE_CLASSES)[number];

/**
 * The `CloudFrontDistributionSchema` class is the schema for the `CloudFrontDistribution` resource,
 * which represents an AWS CloudFront distribution. Terraform provisions it as
 * [`aws_cloudfront_distribution`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_distribution),
 * alongside an
 * [`aws_cloudfront_origin_access_control`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudfront_origin_access_control)
 * per S3 origin and one terraform resource per policy the distribution declares.
 *
 * @group Resources/CloudFrontDistribution
 *
 * @hideconstructor
 *
 * @overrideProperty parents - The Lambda functions and ALBs it serves, each attached after
 * construction, with `addLambdaOrigin()` and `addAlbOrigin()`. An S3 bucket is a child of the
 * distribution instead.
 * ```mermaid
 * graph TD;
 *   alb((ALB)) --> cloudfront_distribution((CloudFront<br>Distribution))
 *   lambda((Lambda<br>Function)) --> cloudfront_distribution
 *   cloudfront_distribution --> s3_bucket((S3<br>Bucket))
 * ```
 * @overrideProperty resourceId - The resource id is of format `cloudfront-<distribution-name>`.
 */
export class CloudFrontDistributionSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.aliases` - The custom domain names the distribution answers on, e.g.
   * `www.example.com`, or `*.example.com` for every host under `example.com`. Each one needs a DNS record pointing at
   * the distribution, which this resource does not create. Empty serves only the `*.cloudfront.net`
   * domain CloudFront assigns.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.behaviors` - The routing table. Exactly one entry has no `pathPattern` and is the
   * default behavior; the rest are matched in order before it.
   * See {@link CloudFrontBehaviorSchema}.
   * * `properties.cachePolicies` - Cache policies this distribution declares.
   * See {@link CloudFrontCachePolicySchema}.
   * * `properties.comment` - A human-readable label, at most 128 characters. It is the only name a
   * distribution carries in the console.
   * * `properties.customErrorResponses` - What the viewer gets for an origin error.
   * See {@link CloudFrontCustomErrorResponseSchema}.
   * * `properties.defaultRootObject` - The object served for a request to the site root, e.g.
   * `index.html` or `docs/index.html`, never starting with `/`. Empty passes the request to the origin
   * as it is.
   * * `properties.distributionName` - What names this distribution. Part of its identity.
   * * `properties.enabled` - Whether the distribution serves traffic. Disabling is also the first
   * half of deleting one, which AWS makes a slow operation.
   * * `properties.geoRestriction` - Which countries may reach the distribution, each an uppercase
   * two-letter ISO 3166-1 code, e.g. `DE`.
   * * `properties.httpVersion` - See {@link ICloudFrontHttpVersion}.
   * * `properties.originGroups` - Fail-over pairs over the origins.
   * See {@link CloudFrontOriginGroupSchema}.
   * * `properties.originRequestPolicies` - Origin request policies this distribution declares.
   * See {@link CloudFrontOriginRequestPolicySchema}.
   * * `properties.origins` - Where content comes from. See {@link CloudFrontOriginSchema}.
   * * `properties.priceClass` - See {@link ICloudFrontPriceClass}.
   * * `properties.responseHeadersPolicies` - Response headers policies this distribution declares.
   * See {@link CloudFrontResponseHeadersPolicySchema}.
   * * `properties.viewerCertificate` - The certificate viewers see. `default` serves CloudFront's
   * own, which is valid only for the assigned `*.cloudfront.net` domain; `acm` serves a certificate
   * of yours, which CloudFront reads from `us-east-1` alone. See
   * {@link ICloudFrontMinimumProtocolVersion}.
   */
  @Validate<unknown>([
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): string[] => value.aliases,
      options: { maxLength: 253, regex: /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): string[] => [
        value.awsAccountId,
        value.distributionName,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): string[] => [value.comment],
      options: { maxLength: 128 },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): string[] => [value.defaultRootObject],
      options: { regex: /^(?!\/)\S*$/ },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): boolean[] => [value.enabled],
      options: { custom: (value: unknown): boolean => typeof value === 'boolean' },
    },
    {
      destruct: (
        value: CloudFrontDistributionSchema['properties'],
      ): CloudFrontDistributionSchema['properties']['geoRestriction'][] => [value.geoRestriction],
      options: {
        custom: (value: CloudFrontDistributionSchema['properties']['geoRestriction']): boolean =>
          value.kind === 'none' ||
          (['allow', 'block'].includes(value.kind) &&
            value.countries.length > 0 &&
            value.countries.every((country) => /^[A-Z]{2}$/.test(country))),
      },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): string[] => [value.httpVersion],
      options: { custom: (value: string): boolean => (CLOUDFRONT_HTTP_VERSIONS as readonly string[]).includes(value) },
    },
    {
      destruct: (value: CloudFrontDistributionSchema['properties']): string[] => [value.priceClass],
      options: { custom: (value: string): boolean => (CLOUDFRONT_PRICE_CLASSES as readonly string[]).includes(value) },
    },
    {
      destruct: (
        value: CloudFrontDistributionSchema['properties'],
      ): CloudFrontDistributionSchema['properties']['viewerCertificate'][] => [value.viewerCertificate],
      options: {
        custom: (value: CloudFrontDistributionSchema['properties']['viewerCertificate']): boolean =>
          value.kind === 'default' ||
          (value.kind === 'acm' &&
            /^arn:aws:acm:[a-z0-9-]+:\d{12}:certificate\/[\w-]+$/.test(value.certificateArn) &&
            (CLOUDFRONT_MINIMUM_PROTOCOL_VERSIONS as readonly string[]).includes(value.minimumProtocolVersion)),
      },
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
    httpVersion: ICloudFrontHttpVersion;
    originGroups: CloudFrontOriginGroupSchema[];
    originRequestPolicies: CloudFrontOriginRequestPolicySchema[];
    origins: CloudFrontOriginSchema[];
    priceClass: ICloudFrontPriceClass;
    responseHeadersPolicies: CloudFrontResponseHeadersPolicySchema[];
    viewerCertificate:
      | { certificateArn: string; kind: 'acm'; minimumProtocolVersion: ICloudFrontMinimumProtocolVersion }
      | { kind: 'default' };
  }>();

  /**
   * Saved response.
   * * `response.Arn` - The ARN of the distribution. A bucket admitting this distribution names it.
   * * `response.DistributionId` - The distribution id, which is what an invalidation is issued against.
   * * `response.DomainName` - The `*.cloudfront.net` domain CloudFront assigned. Point a DNS record
   * at this.
   * * `response.HostedZoneId` - The zone a Route 53 alias record pointing at this distribution needs.
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
