import {
  ResourceGroupsTaggingAPIClient,
  TagResourcesCommand,
  UntagResourcesCommand,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { type Container, type Diff, DiffAction } from '@quadnix/octo';
import { type ResourceGroupsTaggingAPIClientFactory } from '../../factories/aws-client.factory.js';

type TagDiffValue = { add: { [key: string]: string }; delete: string[]; update: { [key: string]: string } };

export class GenericResourceTaggingAction {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.UPDATE && diff.field === 'tags';
  }

  async handle(
    diff: Diff,
    properties: { awsAccountId: string; awsRegionId: string; resourceArn: string },
  ): Promise<void> {
    // Get properties.
    const diffValue = diff.value as TagDiffValue;

    // Get instances.
    const resourceGroupsTaggingApiClient = await this.container.get<
      ResourceGroupsTaggingAPIClient,
      typeof ResourceGroupsTaggingAPIClientFactory
    >(ResourceGroupsTaggingAPIClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    if (diffValue.delete.length > 0) {
      await resourceGroupsTaggingApiClient.send(
        new UntagResourcesCommand({
          ResourceARNList: [properties.resourceArn],
          TagKeys: diffValue.delete,
        }),
      );
    }

    if (Object.keys(diffValue.add).length > 0 || Object.keys(diffValue.update).length > 0) {
      await resourceGroupsTaggingApiClient.send(
        new TagResourcesCommand({
          ResourceARNList: [properties.resourceArn],
          Tags: { ...diffValue.add, ...diffValue.update },
        }),
      );
    }
  }

  async mock(_diff: Diff, properties: { awsAccountId: string; awsRegionId: string }): Promise<void> {
    // Get instances.
    const resourceGroupsTaggingApiClient = await this.container.get<
      ResourceGroupsTaggingAPIClient,
      typeof ResourceGroupsTaggingAPIClientFactory
    >(ResourceGroupsTaggingAPIClient, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    resourceGroupsTaggingApiClient.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof TagResourcesCommand) {
        return {};
      } else if (instance instanceof UntagResourcesCommand) {
        return {};
      }
    };
  }
}
