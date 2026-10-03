import { Schema, Validate } from '@quadnix/octo';

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
   * * `s3` is a bucket reached privately, through an origin access control the distribution creates.
   * Read access on the bucket is granted by the bucket, not here.
   * * `lambda` is the URL of a Lambda function, reached over HTTPS through an origin access control the
   * distribution creates. The function admits the distribution, not this origin. `resourceId` is the
   * function's, set by `CloudFrontDistribution.addLambdaOrigin()` when it attaches the function.
   * * `alb` is an internet-facing ALB, reached over HTTP on port 80, the only listener octo's ALB
   * has. `resourceId` is the ALB's, set by `CloudFrontDistribution.addAlbOrigin()` when it attaches the ALB.
   * * `custom` is a hostname octo does not manage - a legacy origin, or a third party.
   */
  @Validate({
    destruct: (value: CloudFrontOriginSchema['kind']): string[] =>
      value.kind === 's3'
        ? [value.bucketName, value.bucketRegion]
        : value.kind === 'lambda' || value.kind === 'alb'
          ? [value.resourceId ?? []].flat()
          : [value.domainName, value.originProtocolPolicy, ...value.sslProtocols],
    options: { minLength: 1 },
  })
  kind = Schema<
    | { bucketName: string; bucketRegion: string; kind: 's3' }
    | { kind: 'lambda'; resourceId?: string }
    | { kind: 'alb'; resourceId?: string }
    | {
        domainName: string;
        httpPort: number;
        httpsPort: number;
        keepaliveTimeout: number;
        kind: 'custom';
        originProtocolPolicy: 'http-only' | 'https-only' | 'match-viewer';
        readTimeout: number;
        sslProtocols: string[];
      }
  >();

  /**
   * A name you choose for this origin, e.g. `website`. Behaviors and origin groups refer to it.
   * Unique across origins and origin groups.
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
   * The `originId` of one of this distribution's origins, which CloudFront falls back to.
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
   * A name you choose for this group, e.g. `website-with-failover`. Behaviors refer to it.
   * Unique across origins and origin groups.
   */
  @Validate({ options: { minLength: 1 } })
  originGroupId = Schema<string>();

  /**
   * The `originId` of one of this distribution's origins, which CloudFront tries first.
   */
  @Validate({ options: { minLength: 1 } })
  primaryOriginId = Schema<string>();
}
