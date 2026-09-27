import { Schema, Validate } from '@quadnix/octo';

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
