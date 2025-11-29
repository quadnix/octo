import { DescribeInternetGatewaysCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import { InternetGateway } from '../internet-gateway.resource.js';

/**
 * @internal
 */
@Action(InternetGateway)
export class ValidateInternetGatewayResourceAction extends ANodeAction implements IResourceAction<InternetGateway> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
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

    // Check if Internet Gateway exists.
    const describeInternetGatewaysResult = await ec2Client.send(
      new DescribeInternetGatewaysCommand({
        InternetGatewayIds: [response.InternetGatewayId!],
      }),
    );
    if (
      !describeInternetGatewaysResult.InternetGateways ||
      describeInternetGatewaysResult.InternetGateways.length === 0
    ) {
      throw new TransactionError(`Internet Gateway with ID ${response.InternetGatewayId} does not exist!`);
    }

    // Validate Internet Gateway VPC attachment (parent).
    const actualInternetGateway = describeInternetGatewaysResult.InternetGateways[0];
    const expectedVpcId = internetGatewayVpc.getSchemaInstanceInResourceAction().response.VpcId;

    const attachments = actualInternetGateway.Attachments || [];
    const vpcAttachment = attachments.find((attachment) => attachment.VpcId === expectedVpcId);

    if (!vpcAttachment) {
      throw new TransactionError(
        `Internet Gateway is not attached to VPC ${expectedVpcId}. Current attachments: ${JSON.stringify(attachments.map((a) => a.VpcId))}`,
      );
    }

    if ((vpcAttachment.State as 'available') !== 'available') {
      throw new TransactionError(
        `Internet Gateway attachment to VPC ${expectedVpcId} is not in available state. Current state: ${vpcAttachment.State}`,
      );
    }

    // Validate Internet Gateway owner (AWS account).
    if (actualInternetGateway.OwnerId !== properties.awsAccountId) {
      throw new TransactionError(
        `Internet Gateway account ID mismatch. Expected: ${properties.awsAccountId}, Actual: ${actualInternetGateway.OwnerId || 'undefined'}`,
      );
    }

    // Validate Internet Gateway ARN format (region should match).
    const expectedArnPrefix = `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:internet-gateway/`;
    if (!response.InternetGatewayArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `Internet Gateway ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.InternetGatewayArn}`,
      );
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateInternetGatewayResourceAction>(ValidateInternetGatewayResourceAction)
export class ValidateInternetGatewayResourceActionFactory {
  private static instance: ValidateInternetGatewayResourceAction;

  static async create(): Promise<ValidateInternetGatewayResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateInternetGatewayResourceAction();
    }
    return this.instance;
  }
}
