import { DescribeAddressesCommand, DescribeNatGatewaysCommand, EC2Client } from '@aws-sdk/client-ec2';
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
import { NatGateway } from '../nat-gateway.resource.js';

/**
 * @internal
 */
@Action(NatGateway)
export class ValidateNatGatewayResourceAction extends ANodeAction implements IResourceAction<NatGateway> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
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
    const natGatewayVpc = natGateway.parents[0];
    const natGatewaySubnet = natGateway.parents[2];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if NAT Gateway exists.
    const describeNatGatewaysResult = await ec2Client.send(
      new DescribeNatGatewaysCommand({
        NatGatewayIds: [response.NatGatewayId!],
      }),
    );
    if (!describeNatGatewaysResult.NatGateways || describeNatGatewaysResult.NatGateways.length === 0) {
      throw new TransactionError(`NAT Gateway with ID ${response.NatGatewayId} does not exist!`);
    }

    // Validate NAT Gateway state.
    const actualNatGateway = describeNatGatewaysResult.NatGateways[0];
    if (actualNatGateway.State !== 'available') {
      throw new TransactionError(
        `NAT Gateway ${response.NatGatewayId} is not in available state. Current state: ${actualNatGateway.State}`,
      );
    }

    // Validate NAT Gateway VPC (parent).
    const expectedVpcId = natGatewayVpc.getSchemaInstanceInResourceAction().response.VpcId;
    if (actualNatGateway.VpcId !== expectedVpcId) {
      throw new TransactionError(
        `NAT Gateway VPC mismatch. Expected: ${expectedVpcId}, Actual: ${actualNatGateway.VpcId || 'undefined'}`,
      );
    }

    // Validate NAT Gateway subnet (parent).
    const expectedSubnetId = natGatewaySubnet.getSchemaInstanceInResourceAction().response.SubnetId;
    if (actualNatGateway.SubnetId !== expectedSubnetId) {
      throw new TransactionError(
        `NAT Gateway subnet mismatch. Expected: ${expectedSubnetId}, Actual: ${actualNatGateway.SubnetId || 'undefined'}`,
      );
    }

    // Validate NAT Gateway connectivity type.
    if (actualNatGateway.ConnectivityType !== properties.ConnectivityType) {
      throw new TransactionError(
        `NAT Gateway connectivity type mismatch. Expected: ${properties.ConnectivityType}, Actual: ${actualNatGateway.ConnectivityType || 'undefined'}`,
      );
    }

    // Validate NAT Gateway ARN format (region should match).
    const expectedArnPrefix = `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:natgateway/`;
    if (!response.NatGatewayArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `NAT Gateway ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.NatGatewayArn}`,
      );
    }

    // Validate Elastic IP allocation.
    const natGatewayAddresses = actualNatGateway.NatGatewayAddresses || [];
    const allocationMatch = natGatewayAddresses.find((addr) => addr.AllocationId === response.AllocationId);

    if (!allocationMatch) {
      throw new TransactionError(
        `NAT Gateway does not have the expected Elastic IP allocation ${response.AllocationId}. Current allocations: ${JSON.stringify(natGatewayAddresses.map((a) => a.AllocationId))}`,
      );
    }

    // Verify Elastic IP exists and is in use.
    const describeAddressesResult = await ec2Client.send(
      new DescribeAddressesCommand({
        AllocationIds: [response.AllocationId!],
      }),
    );

    if (!describeAddressesResult.Addresses || describeAddressesResult.Addresses.length === 0) {
      throw new TransactionError(`Elastic IP with allocation ID ${response.AllocationId} does not exist!`);
    }

    const elasticIp = describeAddressesResult.Addresses[0];
    if (elasticIp.Domain !== 'vpc') {
      throw new TransactionError(
        `Elastic IP domain mismatch. Expected: vpc, Actual: ${elasticIp.Domain || 'undefined'}`,
      );
    }

    if (elasticIp.AssociationId !== allocationMatch.AssociationId) {
      throw new TransactionError(
        `Elastic IP association ID mismatch. Expected: ${allocationMatch.AssociationId}, Actual: ${elasticIp.AssociationId || 'undefined'}`,
      );
    }

    if (elasticIp.NetworkInterfaceOwnerId !== properties.awsAccountId) {
      throw new TransactionError(
        `Elastic IP owner account mismatch. Expected: ${properties.awsAccountId}, Actual: ${elasticIp.NetworkInterfaceOwnerId || 'undefined'}`,
      );
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateNatGatewayResourceAction>(ValidateNatGatewayResourceAction)
export class ValidateNatGatewayResourceActionFactory {
  private static instance: ValidateNatGatewayResourceAction;

  static async create(): Promise<ValidateNatGatewayResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateNatGatewayResourceAction();
    }
    return this.instance;
  }
}

