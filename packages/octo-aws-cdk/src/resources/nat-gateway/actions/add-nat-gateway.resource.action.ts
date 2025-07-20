import { AllocateAddressCommand, CreateNatGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { NatGatewaySchema } from '../index.schema.js';
import { NatGateway } from '../nat-gateway.resource.js';

/**
 * @internal
 */
@Action(NatGateway)
export class AddNatGatewayResourceAction implements IResourceAction<NatGateway> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof NatGateway &&
      hasNodeName(diff.node, 'nat-gateway') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<NatGateway>): Promise<void> {
    // Get properties.
    const natGateway = diff.node;
    const properties = natGateway.properties;
    const response = natGateway.response;
    const subnet = natGateway.parents[2];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create an Elastic IP.
    const elasticIpOutput = await ec2Client.send(
      new AllocateAddressCommand({
        Domain: 'vpc',
      }),
    );

    // Create NAT Gateway.
    const natGatewayOutput = await ec2Client.send(
      new CreateNatGatewayCommand({
        AllocationId: elasticIpOutput.AllocationId,
        ConnectivityType: properties.ConnectivityType,
        SubnetId: subnet.getSchemaInstanceInResourceAction().response.SubnetId,
      }),
    );

    // Set response.
    const natId = natGatewayOutput.NatGateway!.NatGatewayId!;
    response.AllocationId = elasticIpOutput.AllocationId!;
    response.NatGatewayArn = `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:natgateway/${natId}`;
    response.NatGatewayId = natId;
  }

  async mock(diff: Diff<NatGateway>, capture: Partial<NatGatewaySchema['response']>): Promise<void> {
    // Get properties.
    const natGateway = diff.node;
    const properties = natGateway.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof AllocateAddressCommand) {
        return { AllocationId: capture.AllocationId };
      } else if (instance instanceof CreateNatGatewayCommand) {
        return { NatGateway: { NatGatewayId: capture.NatGatewayId } };
      }
    };
  }
}

/**
 * @internal
 */
@Factory<AddNatGatewayResourceAction>(AddNatGatewayResourceAction)
export class AddNatGatewayResourceActionFactory {
  private static instance: AddNatGatewayResourceAction;

  static async create(): Promise<AddNatGatewayResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new AddNatGatewayResourceAction(container);
    }
    return this.instance;
  }
}
