import {
  DeleteNatGatewayCommand,
  DescribeNatGatewaysCommand,
  EC2Client,
  ReleaseAddressCommand,
} from '@aws-sdk/client-ec2';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { RetryUtility } from '../../../utilities/retry/retry.utility.js';
import { NatGateway } from '../nat-gateway.resource.js';

/**
 * @internal
 */
@Action(NatGateway)
export class DeleteNatGatewayResourceAction extends ANodeAction implements IResourceAction<NatGateway> {
  actionTimeoutInMs: number = 180000; // 3 minutes.

  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
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

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Delete NAT Gateway.
    await ec2Client.send(
      new DeleteNatGatewayCommand({
        NatGatewayId: response.NatGatewayId!,
      }),
    );

    // Wait for NAT Gateway to be deleted.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        this.log('Waiting for NAT Gateway to be deleted.');

        const result = await ec2Client.send(
          new DescribeNatGatewaysCommand({
            NatGatewayIds: [response.NatGatewayId!],
          }),
        );
        const natGateway = result.NatGateways?.[0];
        return !natGateway || natGateway.State === 'deleted';
      },
      {
        initialDelayInMs: 0,
        maxRetries: 10,
        retryDelayInMs: 20000,
        throwOnError: false,
      },
    );

    // Delete Elastic IP.
    await RetryUtility.retryPromise(
      async (): Promise<boolean> => {
        this.log('Waiting for Elastic IP used by the NAT Gateway to be released.');

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
}

/**
 * @internal
 */
@Factory<DeleteNatGatewayResourceAction>(DeleteNatGatewayResourceAction)
export class DeleteNatGatewayResourceActionFactory {
  private static instance: DeleteNatGatewayResourceAction;

  static async create(): Promise<DeleteNatGatewayResourceAction> {
    if (!this.instance) {
      this.instance = new DeleteNatGatewayResourceAction();
    }
    return this.instance;
  }
}
