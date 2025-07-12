import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `SubnetSchema` class is the schema for the `Subnet` resource,
 * which represents the AWS VPC Subnet resource.
 * This resource can create a subnet in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/).
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
  }>();
}
