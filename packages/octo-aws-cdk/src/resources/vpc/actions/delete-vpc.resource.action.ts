import { DeleteVpcCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { Vpc } from '../vpc.resource.js';

/**
 * @internal
 */
@Action(Vpc)
export class DeleteVpcResourceAction implements IResourceAction<Vpc> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof Vpc &&
      hasNodeName(diff.node, 'vpc') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<Vpc>): Promise<void> {
    // Get properties.
    const vpc = diff.node;
    const properties = vpc.properties;
    const response = vpc.response;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete VPC.
    await ec2Client.send(
      new DeleteVpcCommand({
        VpcId: response.VpcId,
      }),
    );
  }
}

/**
 * @internal
 */
@Factory<DeleteVpcResourceAction>(DeleteVpcResourceAction)
export class DeleteVpcResourceActionFactory {
  private static instance: DeleteVpcResourceAction;

  static async create(): Promise<DeleteVpcResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteVpcResourceAction(container);
    }
    return this.instance;
  }
}
