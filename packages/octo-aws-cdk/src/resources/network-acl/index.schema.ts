import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * Defines the schema for a network acl entry.
 * These values are mapped from the official EC2 create network acl entry document.
 * Please refer to the AWS documentation for more information.
 *
 * @group Resources/NetworkAcl
 *
 * @hideconstructor
 */
export class NetworkAclEntrySchema {
  /**
   * The IpV4 network range to allow or deny, in CIDR notation.
   */
  @Validate({ options: { minLength: 1 } })
  CidrBlock = Schema<string>();

  /**
   * Indicates whether this is an egress rule (rule is applied to traffic leaving the subnet).
   */
  @Validate({ options: { minLength: 1 } })
  Egress = Schema<boolean>();

  /**
   * The range of ports the rule applies to.
   */
  @Validate({
    destruct: (value: NetworkAclEntrySchema['PortRange']): number[] => [value.From, value.To],
    options: { maxLength: 65535, minLength: -1 },
  })
  PortRange = Schema<{ From: number; To: number }>();

  /**
   * The protocol number. A value of "-1" means all protocols.
   */
  @Validate({ options: { minLength: 1 } })
  Protocol = Schema<string>();

  /**
   * Indicates whether to allow or deny the traffic that matches the rule.
   */
  @Validate({ options: { minLength: 1 } })
  RuleAction = Schema<'allow' | 'deny'>();

  /**
   * The rule number for the entry. ACL entries are processed in ascending order by rule number.
   */
  @Validate({ options: { minLength: 1 } })
  RuleNumber = Schema<number>();
}

/**
 * The `NetworkAclSchema` class is the schema for the `NetworkAcl` resource,
 * which represents the AWS VPC Network ACL resource.
 * This resource can create a network acl in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/).
 *
 * @group Resources/NetworkAcl
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   vpc((Vpc)) --> network_acl((Network<br>Acl))
 *   subnet((Subnet)) --> network_acl
 * ```
 * @overrideProperty resourceId - The resource id is of format `nacl-<subnet-id>`
 */
export class NetworkAclSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.entries` - The network acl entries. See {@link NetworkAclEntrySchema} for options.
   */
  @Validate<unknown>([
    {
      destruct: (value: NetworkAclSchema['properties']): string[] => [value.awsAccountId, value.awsRegionId],
      options: { minLength: 1 },
    },
    {
      destruct: (value: NetworkAclSchema['properties']): NetworkAclEntrySchema[] => value.entries,
      options: { isSchema: { schema: NetworkAclEntrySchema } },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    entries: NetworkAclEntrySchema[];
  }>();

  /**
   * Saved response.
   * * `response.associationId` - The association id.
   * * `response.defaultNetworkAclId` - The default network acl id.
   * * `response.NetworkAclArn` - The network acl arn.
   * * `response.NetworkAclId` - The network acl id.
   */
  @Validate({
    destruct: (value: NetworkAclSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.associationId) {
        subjects.push(value.associationId);
      }
      if (value.defaultNetworkAclId) {
        subjects.push(value.defaultNetworkAclId);
      }
      if (value.NetworkAclArn) {
        subjects.push(value.NetworkAclArn);
      }
      if (value.NetworkAclId) {
        subjects.push(value.NetworkAclId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    associationId?: string;
    defaultNetworkAclId?: string;
    NetworkAclArn?: string;
    NetworkAclId?: string;
  }>();
}
