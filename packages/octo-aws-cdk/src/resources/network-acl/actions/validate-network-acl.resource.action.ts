import { DescribeNetworkAclsCommand, EC2Client } from '@aws-sdk/client-ec2';
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
import { NetworkAcl } from '../network-acl.resource.js';

/**
 * @internal
 */
@Action(NetworkAcl)
export class ValidateNetworkAclResourceAction extends ANodeAction implements IResourceAction<NetworkAcl> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof NetworkAcl &&
      hasNodeName(diff.node, 'network-acl') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<NetworkAcl>): Promise<void> {
    // Get properties.
    const networkAcl = diff.node;
    const properties = networkAcl.properties;
    const response = networkAcl.response;
    const networkAclVpc = networkAcl.parents[0];
    const networkAclSubnet = networkAcl.parents[1];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if Network ACL exists.
    const describeNetworkAclsResult = await ec2Client.send(
      new DescribeNetworkAclsCommand({
        NetworkAclIds: [response.NetworkAclId!],
      }),
    );
    if (!describeNetworkAclsResult.NetworkAcls || describeNetworkAclsResult.NetworkAcls.length === 0) {
      throw new TransactionError(`Network ACL with ID ${response.NetworkAclId} does not exist!`);
    }

    // Validate Network ACL VPC (parent).
    const actualNetworkAcl = describeNetworkAclsResult.NetworkAcls[0];
    const expectedVpcId = networkAclVpc.getSchemaInstanceInResourceAction().response.VpcId;
    if (actualNetworkAcl.VpcId !== expectedVpcId) {
      throw new TransactionError(
        `Network ACL VPC mismatch. Expected: ${expectedVpcId}, Actual: ${actualNetworkAcl.VpcId || 'undefined'}`,
      );
    }

    // Validate Network ACL owner (AWS account).
    if (actualNetworkAcl.OwnerId !== properties.awsAccountId) {
      throw new TransactionError(
        `Network ACL account ID mismatch. Expected: ${properties.awsAccountId}, Actual: ${actualNetworkAcl.OwnerId || 'undefined'}`,
      );
    }

    // Validate Network ACL ARN format (region should match).
    const expectedArnPrefix = `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:network-acl/`;
    if (!response.NetworkAclArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `Network ACL ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.NetworkAclArn}`,
      );
    }

    // Validate subnet association.
    const expectedSubnetId = networkAclSubnet.getSchemaInstanceInResourceAction().response.SubnetId;
    const subnetAssociation = actualNetworkAcl.Associations?.find((assoc) => assoc.SubnetId === expectedSubnetId);

    if (!subnetAssociation) {
      throw new TransactionError(
        `Network ACL is not associated with subnet ${expectedSubnetId}. Current associations: ${JSON.stringify(actualNetworkAcl.Associations?.map((a) => a.SubnetId))}`,
      );
    }

    if (subnetAssociation.NetworkAclAssociationId !== response.associationId) {
      throw new TransactionError(
        `Network ACL subnet association ID mismatch. Expected: ${response.associationId}, Actual: ${subnetAssociation.NetworkAclAssociationId || 'undefined'}`,
      );
    }

    // Validate Network ACL entries.
    const actualEntries = actualNetworkAcl.Entries || [];
    const expectedEntries = properties.entries;

    // Filter out default entries (rule number 32767 is default deny rule).
    const customEntries = actualEntries.filter((entry) => entry.RuleNumber !== 32767);

    if (customEntries.length !== expectedEntries.length) {
      throw new TransactionError(
        `Network ACL entry count mismatch. Expected: ${expectedEntries.length}, Actual: ${customEntries.length}`,
      );
    }

    // Validate each entry.
    for (const expectedEntry of expectedEntries) {
      const matchingEntry = customEntries.find(
        (actualEntry) =>
          actualEntry.RuleNumber === expectedEntry.RuleNumber && actualEntry.Egress === expectedEntry.Egress,
      );

      if (!matchingEntry) {
        throw new TransactionError(
          `Network ACL entry not found: RuleNumber=${expectedEntry.RuleNumber}, Egress=${expectedEntry.Egress}`,
        );
      }

      // Validate entry CIDR block.
      if (matchingEntry.CidrBlock !== expectedEntry.CidrBlock) {
        throw new TransactionError(
          `Network ACL entry RuleNumber=${expectedEntry.RuleNumber} CIDR block mismatch. Expected: ${expectedEntry.CidrBlock}, Actual: ${matchingEntry.CidrBlock || 'undefined'}`,
        );
      }

      // Validate entry protocol.
      if (matchingEntry.Protocol !== expectedEntry.Protocol) {
        throw new TransactionError(
          `Network ACL entry RuleNumber=${expectedEntry.RuleNumber} protocol mismatch. Expected: ${expectedEntry.Protocol}, Actual: ${matchingEntry.Protocol || 'undefined'}`,
        );
      }

      // Validate entry rule action.
      if (matchingEntry.RuleAction !== expectedEntry.RuleAction) {
        throw new TransactionError(
          `Network ACL entry RuleNumber=${expectedEntry.RuleNumber} rule action mismatch. Expected: ${expectedEntry.RuleAction}, Actual: ${matchingEntry.RuleAction || 'undefined'}`,
        );
      }

      // Validate entry port range.
      if (matchingEntry.PortRange?.From !== expectedEntry.PortRange.From) {
        throw new TransactionError(
          `Network ACL entry RuleNumber=${expectedEntry.RuleNumber} port range From mismatch. Expected: ${expectedEntry.PortRange.From}, Actual: ${matchingEntry.PortRange?.From || 'undefined'}`,
        );
      }

      if (matchingEntry.PortRange?.To !== expectedEntry.PortRange.To) {
        throw new TransactionError(
          `Network ACL entry RuleNumber=${expectedEntry.RuleNumber} port range To mismatch. Expected: ${expectedEntry.PortRange.To}, Actual: ${matchingEntry.PortRange?.To || 'undefined'}`,
        );
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateNetworkAclResourceAction>(ValidateNetworkAclResourceAction)
export class ValidateNetworkAclResourceActionFactory {
  private static instance: ValidateNetworkAclResourceAction;

  static async create(): Promise<ValidateNetworkAclResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateNetworkAclResourceAction();
    }
    return this.instance;
  }
}

