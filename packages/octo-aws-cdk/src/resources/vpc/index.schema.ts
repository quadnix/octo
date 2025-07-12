import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `VpcSchema` class is the schema for the `Vpc` resource,
 * which represents the AWS Virtual Private Cloud (VPC) resource.
 * This resource can create a vpc in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/).
 *
 * @group Resources/Vpc
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has no parents.
 * @overrideProperty resourceId - The resource id is of format `vpc-<region-id>`
 */
export class VpcSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsAvailabilityZones` - The AWS availability zones.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.CidrBlock` - The CIDR block.
   * * `properties.InstanceTenancy` - The instance tenancy. Possible values are `default`.
   */
  @Validate({
    destruct: (value: VpcSchema['properties']): string[] => [
      value.awsAccountId,
      ...value.awsAvailabilityZones,
      value.awsRegionId,
      value.CidrBlock,
      value.InstanceTenancy,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsAvailabilityZones: string[];
    awsRegionId: string;
    CidrBlock: string;
    InstanceTenancy: 'default';
  }>();

  /**
   * Saved response.
   * * `response.VpcArn` - The VPC ARN.
   * * `response.VpcId` - The VPC ID.
   */
  @Validate({
    destruct: (value: VpcSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.VpcArn) {
        subjects.push(value.VpcArn);
      }
      if (value.VpcId) {
        subjects.push(value.VpcId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    VpcArn?: string;
    VpcId?: string;
  }>();
}
