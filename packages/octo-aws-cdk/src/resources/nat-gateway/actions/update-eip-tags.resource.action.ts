import { CreateTagsCommand, DeleteTagsCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  Action,
  Container,
  type Diff,
  DiffAction,
  type DiffValueTypeTagUpdate,
  Factory,
  type IResourceAction,
  hasNodeName,
} from '@quadnix/octo';
import type { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { NatGateway } from '../nat-gateway.resource.js';

/**
 * @internal
 */
@Action(NatGateway)
export class UpdateEipTagsResourceAction implements IResourceAction<NatGateway> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof NatGateway &&
      hasNodeName(diff.node, 'nat-gateway') &&
      diff.field === 'tags'
    );
  }

  async handle(diff: Diff<NatGateway, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const nat = diff.node;
    const properties = nat.properties;
    const response = nat.response;
    const tagUpdates = diff.value;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete tags.
    if (tagUpdates.delete.length > 0) {
      await ec2Client.send(
        new DeleteTagsCommand({
          Resources: [response.AllocationId!],
          Tags: tagUpdates.delete.map((tag) => ({ Key: tag })),
        }),
      );
    }

    // Add/Update tags.
    if (Object.keys(tagUpdates.add).length > 0 || Object.keys(tagUpdates.update).length > 0) {
      await ec2Client.send(
        new CreateTagsCommand({
          Resources: [response.AllocationId!],
          Tags: Object.entries({ ...tagUpdates.add, ...tagUpdates.update }).map(([key, value]) => ({
            Key: key,
            Value: value,
          })),
        }),
      );
    }
  }

  async mock(diff: Diff<NatGateway, DiffValueTypeTagUpdate>): Promise<void> {
    // Get properties.
    const nat = diff.node;
    const properties = nat.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (): Promise<void> => {};
  }
}

/**
 * @internal
 */
@Factory<UpdateEipTagsResourceAction>(UpdateEipTagsResourceAction)
export class UpdateEipTagsResourceActionFactory {
  private static instance: UpdateEipTagsResourceAction;

  static async create(): Promise<UpdateEipTagsResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateEipTagsResourceAction(container);
    }
    return this.instance;
  }
}
