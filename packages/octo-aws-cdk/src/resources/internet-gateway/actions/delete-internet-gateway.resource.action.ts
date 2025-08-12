import { DeleteInternetGatewayCommand, DetachInternetGatewayCommand, EC2Client } from '@aws-sdk/client-ec2';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { InternetGateway } from '../internet-gateway.resource.js';

/**
 * @internal
 */
@Action(InternetGateway)
export class DeleteInternetGatewayResourceAction extends ANodeAction implements IResourceAction<InternetGateway> {
  actionTimeoutInMs: number = 120000; // 2 minutes.

  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
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
    const internetGatewayVpc = internetGateway.parents[0];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Detach from VPC.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        this.log('Attempting to detach Internet Gateway from VPC.');

        await ec2Client.send(
          new DetachInternetGatewayCommand({
            InternetGatewayId: response.InternetGatewayId,
            VpcId: internetGatewayVpc.getSchemaInstanceInResourceAction().response.VpcId,
          }),
        );
        return true;
      },
      {
        initialDelayInMs: 0,
        maxRetries: 10,
        retryDelayInMs: 5000,
        throwOnError: false,
      },
    );

    // Delete Internet Gateway.
    await ec2Client.send(
      new DeleteInternetGatewayCommand({
        InternetGatewayId: response.InternetGatewayId,
      }),
    );
  }

  async mock(diff: Diff<InternetGateway>): Promise<void> {
    // Get properties.
    const internetGateway = diff.node;
    const properties = internetGateway.properties;

    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });
    ec2Client.send = async (instance: unknown): Promise<unknown> => {
      if (instance instanceof DetachInternetGatewayCommand) {
        return;
      } else if (instance instanceof DeleteInternetGatewayCommand) {
        return;
      }
    };
  }
}

/**
 * @internal
 */
@Factory<DeleteInternetGatewayResourceAction>(DeleteInternetGatewayResourceAction)
export class DeleteInternetGatewayResourceActionFactory {
  private static instance: DeleteInternetGatewayResourceAction;

  static async create(): Promise<DeleteInternetGatewayResourceAction> {
    if (!this.instance) {
      this.instance = new DeleteInternetGatewayResourceAction();
    }
    return this.instance;
  }
}
