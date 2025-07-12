import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `NatGatewaySchema` class is the schema for the `NatGateway` resource,
 * which represents the AWS VPC NAT Gateway resource.
 * This resource can create a nat gateway in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/).
 *
 * @group Resources/NatGateway
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   vpc((Vpc)) --> nat_gateway((Nat<br>Gateway))
 *   internet_gateway((Internet<br>Gateway)) --> nat_gateway
 *   subnet((Subnet)) --> nat_gateway
 * ```
 * @overrideProperty resourceId - The resource id is of format `nat-gateway-<subnet-id>`
 */
export class NatGatewaySchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.ConnectivityType` - The connectivity type. Possible values are `public`.
   */
  @Validate({
    destruct: (value: NatGatewaySchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.ConnectivityType,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    ConnectivityType: 'public';
  }>();

  /**
   * Saved response.
   * * `response.AllocationId` - The allocation id representing relationship between nat gateway and subnet.
   * * `response.NatGatewayArn` - The nat gateway arn.
   * * `response.NatGatewayId` - The nat gateway id.
   */
  @Validate({
    destruct: (value: NatGatewaySchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.AllocationId) {
        subjects.push(value.AllocationId);
      }
      if (value.NatGatewayArn) {
        subjects.push(value.NatGatewayArn);
      }
      if (value.NatGatewayId) {
        subjects.push(value.NatGatewayId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    AllocationId?: string;
    NatGatewayArn?: string;
    NatGatewayId?: string;
  }>();
}
