import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { type Container, type Diff, DiffAction, type DiffValueTypeTagUpdate } from '@quadnix/octo';
import { type ResourceGroupsTaggingAPIClientFactory } from '../../factories/aws-client.factory.js';

/**
 * @internal
 */
export class GenericResourceTaggingAction {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.UPDATE && diff.field === 'tags';
  }

  async handle(
    diff: Diff<any, DiffValueTypeTagUpdate>,
    properties: { awsAccountId: string; awsRegionId: string; resourceArn: string },
  ): Promise<any> {
    // Get instances.
    const resourceGroupsTaggingApiClient = await this.container.get<
      ResourceGroupsTaggingAPIClient,
      typeof ResourceGroupsTaggingAPIClientFactory
    >(ResourceGroupsTaggingAPIClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    if (diff.value.delete.length > 0) {
      await resourceGroupsTaggingApiClient.send(
        new UntagResourcesCommand({
          ResourceARNList: [properties.resourceArn],
          TagKeys: diff.value.delete,
        }),
      );
    }

    if (Object.keys(diff.value.add).length > 0 || Object.keys(diff.value.update).length > 0) {
      await resourceGroupsTaggingApiClient.send(
        new TagResourcesCommand({
          ResourceARNList: [properties.resourceArn],
          Tags: { ...diff.value.add, ...diff.value.update },
        }),
      );
    }
  }
}
