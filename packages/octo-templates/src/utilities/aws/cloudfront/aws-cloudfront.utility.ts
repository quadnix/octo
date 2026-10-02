import { CloudFrontClient, GetDistributionCommand, ListInvalidationsCommand } from '@aws-sdk/client-cloudfront';

/**
 * The only region CloudFront is reached at, wherever the origins behind it live.
 */
const CLOUDFRONT_GLOBAL_REGION = 'us-east-1';

/**
 * Reads back what a distribution holds, which is the half of an invalidation octo cannot show.
 *
 * The call that issues one is fire-and-forget - it returns as soon as AWS accepts it, and nothing
 * downstream reads the result - so the only proof that a deploy invalidated once, and only once, is
 * what the distribution itself lists.
 */
export class AwsCloudFrontUtility {
  private readonly client: CloudFrontClient;

  /**
   * @param endpoint Address of an AWS-compatible service, e.g. a localstack container. Defaults to AWS.
   */
  constructor(endpoint?: string) {
    this.client = new CloudFrontClient({ endpoint, region: CLOUDFRONT_GLOBAL_REGION });
  }

  /**
   * Returns the ids of every invalidation issued against the distribution, newest first.
   */
  async getInvalidationIds(distributionId: string): Promise<string[]> {
    const ids: string[] = [];

    let marker: string | undefined;
    do {
      const { InvalidationList } = await this.client.send(
        new ListInvalidationsCommand({ DistributionId: distributionId, Marker: marker }),
      );
      for (const item of InvalidationList?.Items ?? []) {
        if (item.Id) {
          ids.push(item.Id);
        }
      }
      marker = InvalidationList?.IsTruncated ? InvalidationList.NextMarker : undefined;
    } while (marker);

    return ids;
  }

  /**
   * Returns the price class the live distribution is configured with, which is what tells an
   * in-place update from a recreation: a recreated distribution is a new id.
   */
  async getPriceClass(distributionId: string): Promise<string> {
    const { Distribution } = await this.client.send(new GetDistributionCommand({ Id: distributionId }));
    return Distribution?.DistributionConfig?.PriceClass ?? '';
  }
}
