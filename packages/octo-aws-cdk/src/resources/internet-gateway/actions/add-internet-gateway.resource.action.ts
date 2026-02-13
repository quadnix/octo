import {
  AttachInternetGatewayCommand,
  CreateInternetGatewayCommand,
  EC2Client,
  waitUntilInternetGatewayExists,
} from '@aws-sdk/client-ec2';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { InternetGatewaySchema } from '../index.schema.js';
import { InternetGateway } from '../internet-gateway.resource.js';

/**
 * @internal
 */
@Action(InternetGateway)
export class AddInternetGatewayResourceAction extends ANodeAction implements IResourceAction<InternetGateway> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof InternetGateway &&
      hasNodeName(diff.node, 'internet-gateway') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<InternetGateway>): Promise<InternetGatewaySchema['response']> {
    // Get properties.
    const internetGateway = diff.node;
    const properties = internetGateway.properties;
    const { awsAccountId, awsRegionId } = properties;
    const tags = internetGateway.tags;
    const internetGatewayVpc = internetGateway.parents[0];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [awsAccountId, awsRegionId],
      metadata: { package: '@octo' },
    });

    // Create Internet Gateway.
    const internetGWOutput = await ec2Client.send(
      new CreateInternetGatewayCommand({
        TagSpecifications:
          Object.keys(tags).length > 0
            ? [
                {
                  ResourceType: 'internet-gateway',
                  Tags: Object.entries(tags).map(([key, value]) => ({ Key: key, Value: value })),
                },
              ]
            : undefined,
      }),
    );
    const igwId = internetGWOutput!.InternetGateway!.InternetGatewayId!;

    // Wait for Internet Gateway to become available.
    await waitUntilInternetGatewayExists({ client: ec2Client, maxWaitTime: 60 }, { InternetGatewayIds: [igwId] });

    // Attach to VPC.
    await ec2Client.send(
      new AttachInternetGatewayCommand({
        InternetGatewayId: igwId,
        VpcId: internetGatewayVpc.getSchemaInstanceInResourceAction().response.VpcId,
      }),
    );

    return {
      InternetGatewayArn: `arn:aws:ec2:${awsRegionId}:${awsAccountId}:internet-gateway/${igwId}`,
      InternetGatewayId: igwId,
    };
  }

  async mock(
    diff: Diff<InternetGateway>,
    capture: Partial<InternetGatewaySchema['response']>,
  ): Promise<InternetGatewaySchema['response']> {
    // Get properties.
    const internetGateway = diff.node;
    const properties = internetGateway.properties;

    const { awsAccountId, awsRegionId } = properties;
    return {
      InternetGatewayArn: `arn:aws:ec2:${awsRegionId}:${awsAccountId}:internet-gateway/${capture.InternetGatewayId}`,
      InternetGatewayId: capture.InternetGatewayId!,
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
      this.instance = new AddInternetGatewayResourceAction();
    }
    return this.instance;
  }
}
