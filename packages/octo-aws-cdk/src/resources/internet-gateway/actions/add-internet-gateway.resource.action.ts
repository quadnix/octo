import { AttachInternetGatewayCommand, CreateInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { InternetGatewaySchema } from '../index.schema.js';
import { InternetGateway } from '../internet-gateway.resource.js';

/**
 * @internal
 */
@Action(InternetGateway)
export class AddInternetGatewayResourceAction implements IResourceAction<InternetGateway> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof InternetGateway &&
      hasNodeName(diff.node, 'internet-gateway') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<InternetGateway>): Promise<void> {
    // Get properties.
    const internetGateway = diff.node;
    const properties = internetGateway.properties;
    const response = internetGateway.response;
    const tags = internetGateway.tags;
    const internetGatewayVpc = internetGateway.parents[0];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create Internet Gateway.
    const internetGWOutput = await ec2Client.send(
      new CreateInternetGatewayCommand({
        TagSpecifications: [
          {
            ResourceType: 'internet-gateway',
            Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
          },
        ],
      }),
    );

    // Attach to VPC.
    await ec2Client.send(
      new AttachInternetGatewayCommand({
        InternetGatewayId: internetGWOutput!.InternetGateway!.InternetGatewayId,
        VpcId: internetGatewayVpc.getSchemaInstanceInResourceAction().response.VpcId,
      }),
    );

    // Set response.
    const { awsAccountId, awsRegionId } = properties;
    const igwId = internetGWOutput!.InternetGateway!.InternetGatewayId!;
    response.InternetGatewayArn = `arn:aws:ec2:${awsRegionId}:${awsAccountId}:internet-gateway/${igwId}`;
    response.InternetGatewayId = igwId;
  }

  async mock(diff: Diff<InternetGateway>, capture: Partial<InternetGatewaySchema['response']>): Promise<void> {
    // Get properties.
    const internetGateway = diff.node;
    const properties = internetGateway.properties;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof CreateInternetGatewayCommand) {
        return { InternetGateway: { InternetGatewayId: capture.InternetGatewayId } };
      } else if (instance instanceof AttachInternetGatewayCommand) {
        return;
      }
    };
  }
}

/**
 * @internal
 */
@Factory<AddInternetGatewayResourceAction>(AddInternetGatewayResourceAction)
export class AddInternetGatewayResourceActionFactory {
  private static instance: AddInternetGatewayResourceAction;

  static async create(): Promise<AddInternetGatewayResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddInternetGatewayResourceAction(container);
    }
    return this.instance;
  }
}
