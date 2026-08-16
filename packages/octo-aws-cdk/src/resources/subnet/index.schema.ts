import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `SubnetSchema` class is the schema for the `Subnet` resource,
 * which represents the AWS VPC Subnet resource.
 * Terraform provisions it as
 * [`aws_subnet`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/subnet).
 *
 * @group Resources/Subnet
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   vpc((Vpc)) --> subnet((Subnet))
 * ```
 * @overrideProperty resourceId - The resource id is of format `subnet-<subnet-id>`
 */
export class SubnetSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.AvailabilityZone` - The availability zone for the subnet.
   * * `properties.awsAccountId` - The AWS account ID.
   * * `properties.awsRegionId` - The AWS region ID.
   * * `properties.CidrBlock` - The CIDR block for the subnet.
   * * `properties.subnetName` - The name of the subnet.
   */
  @Validate({
    destruct: (value: SubnetSchema['properties']): string[] => [
      value.AvailabilityZone,
      value.awsAccountId,
      value.awsRegionId,
      value.CidrBlock,
      value.subnetName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    AvailabilityZone: string;
    awsAccountId: string;
    awsRegionId: string;
    CidrBlock: string;
    subnetName: string;
  }>();

  /**
   * Saved response.
   * * `response.SubnetArn` - The ARN of the subnet.
   * * `response.SubnetId` - The ID of the subnet.
   */
  @Validate({
    destruct: (value: SubnetSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.SubnetArn) {
        subjects.push(value.SubnetArn);
      }
      if (value.SubnetId) {
        subjects.push(value.SubnetId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    SubnetArn?: string;
    SubnetId?: string;
  }>({
    SubnetArn: 'arn:aws:ec2:us-east-1:000000000000:subnet/subnet-0123456789abcdef0',
    SubnetId: 'subnet-0123456789abcdef0',
  });
}
