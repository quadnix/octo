import { DeleteSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { Subnet } from '../subnet.resource.js';

@Action(Subnet)
export class DeleteSubnetResourceAction implements IResourceAction<Subnet> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof Subnet &&
      (diff.node.constructor as typeof Subnet).NODE_NAME === 'subnet' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.node as Subnet;
    const properties = subnet.properties;
    const response = subnet.response;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete Subnet.
    await ec2Client.send(
      new DeleteSubnetCommand({
        SubnetId: response.SubnetId,
      }),
    );
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const subnet = diff.node as Subnet;
    const properties = subnet.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteSubnetCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteSubnetResourceAction>(DeleteSubnetResourceAction)
export class DeleteSubnetResourceActionFactory {
  private static instance: DeleteSubnetResourceAction;

  static async create(): Promise<DeleteSubnetResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteSubnetResourceAction(container);
    }
    return this.instance;
  }
}
