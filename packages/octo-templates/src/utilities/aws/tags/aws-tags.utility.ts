import { IAMClient, ListRoleTagsCommand, ListRolesCommand } from '@aws-sdk/client-iam';
import { GetResourcesCommand, ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';

/**
 * Finds resources by tag: the Resource Groups Tagging API for the region, and IAM for the roles, which
 * that API does not list.
 */
export class AwsTagsUtility {
  private readonly client: ResourceGroupsTaggingAPIClient;
  private readonly iamClient: IAMClient;

  /**
   * @param region The AWS region whose tagged resources are read. IAM roles are read globally.
   * @param endpoint Address of an AWS-compatible service, e.g. a localstack container. Defaults to AWS.
   */
  constructor(region: string, endpoint?: string) {
    this.client = new ResourceGroupsTaggingAPIClient({ endpoint, region });
    this.iamClient = new IAMClient({ endpoint, region: 'us-east-1' });
  }

  /**
   * Returns the ARNs of every resource tagged with all of the given key/value pairs, IAM roles included.
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

    return [...arns, ...(await this.getRoleArnsByTags(tags))];
  }

  /**
   * Returns the ARNs of every IAM role in the account tagged with all of the given key/value pairs.
   */
  private async getRoleArnsByTags(tags: Record<string, string>): Promise<string[]> {
    const arns: string[] = [];

    let marker: string | undefined;
    do {
      const response = await this.iamClient.send(new ListRolesCommand({ Marker: marker }));
      for (const role of response.Roles ?? []) {
        const { Tags: roleTags = [] } = await this.iamClient.send(new ListRoleTagsCommand({ RoleName: role.RoleName }));
        if (Object.entries(tags).every(([key, value]) => roleTags.some((t) => t.Key === key && t.Value === value))) {
          arns.push(role.Arn!);
        }
      }
      marker = response.IsTruncated ? response.Marker : undefined;
    } while (marker);

    return arns;
  }
}
