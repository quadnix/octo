import { DeleteSubnetCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { Subnet } from '../subnet.resource.js';

/**
 * @internal
 */
@Action(Subnet)
export class DeleteSubnetResourceAction implements IResourceAction<Subnet> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof Subnet &&
      hasNodeName(diff.node, 'subnet') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<Subnet>): Promise<void> {
    // Get properties.
    const subnet = diff.node;
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

  async mock(diff: Diff<Subnet>): Promise<void> {
    // Get properties.
    const subnet = diff.node;
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

/**
 * @internal
 */
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
