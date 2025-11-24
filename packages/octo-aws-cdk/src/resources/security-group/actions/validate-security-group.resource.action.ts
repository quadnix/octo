import { DescribeSecurityGroupRulesCommand, DescribeSecurityGroupsCommand, EC2Client } from '@aws-sdk/client-ec2';
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
import { SecurityGroup } from '../security-group.resource.js';

/**
 * @internal
 */
@Action(SecurityGroup)
export class ValidateSecurityGroupResourceAction extends ANodeAction implements IResourceAction<SecurityGroup> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof SecurityGroup &&
      hasNodeName(diff.node, 'security-group') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<SecurityGroup>): Promise<void> {
    // Get properties.
    const securityGroup = diff.node;
    const properties = securityGroup.properties;
    const response = securityGroup.response;
    const securityGroupVpc = securityGroup.parents[0];

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if Security Group exists.
    const describeSecurityGroupsResult = await ec2Client.send(
      new DescribeSecurityGroupsCommand({
        GroupIds: [response.GroupId!],
      }),
    );
    if (!describeSecurityGroupsResult.SecurityGroups || describeSecurityGroupsResult.SecurityGroups.length === 0) {
      throw new TransactionError(`Security Group with ID ${response.GroupId} does not exist!`);
    }

    // Validate Security Group VPC (parent).
    const actualSecurityGroup = describeSecurityGroupsResult.SecurityGroups[0];
    const expectedVpcId = securityGroupVpc.getSchemaInstanceInResourceAction().response.VpcId;
    if (actualSecurityGroup.VpcId !== expectedVpcId) {
      throw new TransactionError(
        `Security Group VPC mismatch. Expected: ${expectedVpcId}, Actual: ${actualSecurityGroup.VpcId || 'undefined'}`,
      );
    }

    // Validate Security Group owner (AWS account).
    if (actualSecurityGroup.OwnerId !== properties.awsAccountId) {
      throw new TransactionError(
        `Security Group account ID mismatch. Expected: ${properties.awsAccountId}, Actual: ${actualSecurityGroup.OwnerId || 'undefined'}`,
      );
    }

    // Validate Security Group ARN format (region should match).
    const expectedArnPrefix = `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:security-group/`;
    if (!response.Arn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `Security Group ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.Arn}`,
      );
    }

    // Get all security group rule IDs to validate.
    const allRuleIds = [
      ...(response.Rules?.egress || []).map((r) => r.SecurityGroupRuleId!),
      ...(response.Rules?.ingress || []).map((r) => r.SecurityGroupRuleId!),
    ];

    // If no rules are expected, verify no rules exist (except default egress rule).
    if (allRuleIds.length === 0) {
      if (properties.rules.length === 0) {
        return;
      }
    }

    // Describe security group rules.
    const describeRulesResult = await ec2Client.send(
      new DescribeSecurityGroupRulesCommand({
        SecurityGroupRuleIds: allRuleIds,
      }),
    );
    if (!describeRulesResult.SecurityGroupRules) {
      throw new TransactionError(`Failed to retrieve security group rules for ${response.GroupId}`);
    }

    // Validate egress rules.
    const expectedEgressRules = properties.rules.filter((rule) => rule.Egress);
    const actualEgressRules = describeRulesResult.SecurityGroupRules.filter((rule) => rule.IsEgress);
    if (expectedEgressRules.length !== actualEgressRules.length) {
      throw new TransactionError(
        `Security Group egress rule count mismatch. Expected: ${expectedEgressRules.length}, Actual: ${actualEgressRules.length}`,
      );
    }

    // Validate each egress rule.
    for (const expectedRule of expectedEgressRules) {
      const matchingRule = actualEgressRules.find(
        (actualRule) =>
          actualRule.FromPort === expectedRule.FromPort &&
          actualRule.ToPort === expectedRule.ToPort &&
          actualRule.IpProtocol === expectedRule.IpProtocol &&
          actualRule.CidrIpv4 === expectedRule.CidrBlock,
      );

      if (!matchingRule) {
        throw new TransactionError(
          `Security Group egress rule not found: FromPort=${expectedRule.FromPort}, ToPort=${expectedRule.ToPort}, IpProtocol=${expectedRule.IpProtocol}, CidrBlock=${expectedRule.CidrBlock}`,
        );
      }
    }

    // Validate ingress rules.
    const expectedIngressRules = properties.rules.filter((rule) => !rule.Egress);
    const actualIngressRules = describeRulesResult.SecurityGroupRules.filter((rule) => !rule.IsEgress);

    if (expectedIngressRules.length !== actualIngressRules.length) {
      throw new TransactionError(
        `Security Group ingress rule count mismatch. Expected: ${expectedIngressRules.length}, Actual: ${actualIngressRules.length}`,
      );
    }

    // Validate each ingress rule.
    for (const expectedRule of expectedIngressRules) {
      const matchingRule = actualIngressRules.find(
        (actualRule) =>
          actualRule.FromPort === expectedRule.FromPort &&
          actualRule.ToPort === expectedRule.ToPort &&
          actualRule.IpProtocol === expectedRule.IpProtocol &&
          actualRule.CidrIpv4 === expectedRule.CidrBlock,
      );

      if (!matchingRule) {
        throw new TransactionError(
          `Security Group ingress rule not found: FromPort=${expectedRule.FromPort}, ToPort=${expectedRule.ToPort}, IpProtocol=${expectedRule.IpProtocol}, CidrBlock=${expectedRule.CidrBlock}`,
        );
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateSecurityGroupResourceAction>(ValidateSecurityGroupResourceAction)
export class ValidateSecurityGroupResourceActionFactory {
  private static instance: ValidateSecurityGroupResourceAction;

  static async create(): Promise<ValidateSecurityGroupResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateSecurityGroupResourceAction();
    }
    return this.instance;
  }
}
