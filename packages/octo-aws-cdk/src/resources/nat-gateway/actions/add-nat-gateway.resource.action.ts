import {
  AllocateAddressCommand,
  CreateNatGatewayCommand,
  EC2Client,
  waitUntilNatGatewayAvailable,
} from '@aws-sdk/client-ec2';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { NatGatewaySchema } from '../index.schema.js';
import { NatGateway } from '../nat-gateway.resource.js';

/**
 * @internal
 */
@Action(NatGateway)
export class AddNatGatewayResourceAction extends ANodeAction implements IResourceAction<NatGateway> {
  actionTimeoutInMs: number = 900000; // 15 minutes.

  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof NatGateway &&
      hasNodeName(diff.node, 'nat-gateway') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<NatGateway>): Promise<NatGatewaySchema['response']> {
    // Get properties.
    const natGateway = diff.node;
    const properties = natGateway.properties;
    const tags = natGateway.tags;
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
        TagSpecifications:
          Object.keys(tags).length > 0
            ? [
                {
                  ResourceType: 'elastic-ip',
                  Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
                },
              ]
            : undefined,
      }),
    );

    // Create NAT Gateway.
    const natGatewayOutput = await ec2Client.send(
      new CreateNatGatewayCommand({
        AllocationId: elasticIpOutput.AllocationId,
        ConnectivityType: properties.ConnectivityType,
        SubnetId: subnet.getSchemaInstanceInResourceAction().response.SubnetId,
        TagSpecifications:
          Object.keys(tags).length > 0
            ? [
                {
                  ResourceType: 'natgateway',
                  Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
                },
              ]
            : undefined,
      }),
    );
    const natId = natGatewayOutput.NatGateway!.NatGatewayId!;

    // Wait for NAT Gateway to become available.
    this.log('Waiting for NAT Gateway to become available.');
    await waitUntilNatGatewayAvailable(
      {
        client: ec2Client,
        maxWaitTime: 840, // 14 minutes.
        minDelay: 30,
      },
      {
        NatGatewayIds: [natId],
      },
    );

    return {
      AllocationId: elasticIpOutput.AllocationId!,
      NatGatewayArn: `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:natgateway/${natId}`,
      NatGatewayId: natId,
    };
  }

  async mock(
    diff: Diff<NatGateway>,
    capture: Partial<NatGatewaySchema['response']>,
  ): Promise<NatGatewaySchema['response']> {
    // Get properties.
    const natGateway = diff.node;
    const properties = natGateway.properties;

    return {
      AllocationId: capture.AllocationId!,
      NatGatewayArn: `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:natgateway/${capture.NatGatewayId}`,
      NatGatewayId: capture.NatGatewayId!,
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
      this.instance = new AddNatGatewayResourceAction();
    }
    return this.instance;
  }
}
