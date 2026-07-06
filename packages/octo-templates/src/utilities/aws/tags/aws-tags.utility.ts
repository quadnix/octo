import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';

/**
 * Queries the AWS Resource Groups Tagging API to find live resources by tag.
 */
export class AwsTagsUtility {
  private readonly client: ResourceGroupsTaggingAPIClient;

  constructor(region: string, endpoint?: string) {
    this.client = new ResourceGroupsTaggingAPIClient({ endpoint, region });
  }

  /**
   * Returns the ARNs of every resource tagged with all of the given key/value pairs.
   */
  async getResourceArnsByTags(tags: Record<string, string>): Promise<string[]> {
    const arns: string[] = [];

    let paginationToken: string | undefined;
    do {
      const response = await this.client.send(
        new GetResourcesCommand({
          PaginationToken: paginationToken || undefined,
          TagFilters: Object.entries(tags).map(([Key, value]) => ({ Key, Values: [value] })),
        }),
      );
      for (const mapping of response.ResourceTagMappingList ?? []) {
        if (mapping.ResourceARN) {
          arns.push(mapping.ResourceARN);
        }
      }
      paginationToken = response.PaginationToken || undefined;
    } while (paginationToken);

    return arns;
  }
}
