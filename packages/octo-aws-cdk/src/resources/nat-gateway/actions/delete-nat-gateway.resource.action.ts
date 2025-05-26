import { DeleteNatGatewayCommand, EC2Client, ReleaseAddressCommand } from '@aws-sdk/client-ec2';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { NatGateway } from '../nat-gateway.resource.js';

@Action(NatGateway)
export class DeleteNatGatewayResourceAction implements IResourceAction<NatGateway> {
  actionTimeoutInMs: number = 180000; // 3 minutes.

  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.node instanceof NatGateway &&
      (diff.node.constructor as typeof NatGateway).NODE_NAME === 'nat-gateway' &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const natGateway = diff.node as NatGateway;
    const properties = natGateway.properties;
    const response = natGateway.response;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete NAT Gateway.
    await ec2Client.send(
      new DeleteNatGatewayCommand({
        NatGatewayId: response.NatGatewayId,
      }),
    );

    // Delete Elastic IP.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        await ec2Client.send(
          new ReleaseAddressCommand({
            AllocationId: response.AllocationId,
          }),
        );
        return true;
      },
      {
        initialDelayInMs: 0,
        maxRetries: 10,
        retryDelayInMs: 10000,
        throwOnError: false,
      },
    );
  }

  async mock(diff: Diff): Promise<void> {
    // Get properties.
    const natGateway = diff.node as NatGateway;
    const properties = natGateway.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DeleteNatGatewayCommand) {
        return;
      } else if (instance instanceof ReleaseAddressCommand) {
        return;
      }
    };
  }
}

@Factory<DeleteNatGatewayResourceAction>(DeleteNatGatewayResourceAction)
export class DeleteNatGatewayResourceActionFactory {
  private static instance: DeleteNatGatewayResourceAction;

  static async create(): Promise<DeleteNatGatewayResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new DeleteNatGatewayResourceAction(container);
    }
    return this.instance;
  }
}
