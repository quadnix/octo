import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `RouteTableSchema` class is the schema for the `RouteTable` resource,
 * which represents the AWS VPC Route Table resource.
 * This resource can create a route table in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/).
 *
 * @group Resources/RouteTable
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   vpc((Vpc)) --> route_table((Route<br>Table))
 *   internet_gateway((Internet<br>Gateway)) --> route_table
 *   subnet((Subnet)) --> route_table
 *   nat_gateway((Nat<br>Gateway)) --> route_table
 * ```
 * @overrideProperty resourceId - The resource id is of format `rt-<subnet-id>`
 */
export class RouteTableSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.associateWithInternetGateway` - Option to associate the route table with an Internet Gateway.
   * * `properties.awsAccountId` - The AWS account ID.
   * * `properties.awsRegionId` - The AWS region ID.
   */
  @Validate({
    destruct: (value: RouteTableSchema['properties']): string[] => [
      String(value.associateWithInternetGateway),
      value.awsAccountId,
      value.awsRegionId,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    associateWithInternetGateway: boolean;
    awsAccountId: string;
    awsRegionId: string;
  }>();

  /**
   * Saved response.
   * * `response.RouteTableArn` - The route table ARN.
   * * `response.RouteTableId` - The route table ID.
   * * `response.subnetAssociationId` - The association ID representing relationship between route table and subnet.
   */
  @Validate({
    destruct: (value: RouteTableSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.RouteTableArn) {
        subjects.push(value.RouteTableArn);
      }
      if (value.RouteTableId) {
        subjects.push(value.RouteTableId);
      }
      if (value.subnetAssociationId) {
        subjects.push(value.subnetAssociationId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    RouteTableArn?: string;
    RouteTableId?: string;
    subnetAssociationId?: string;
  }>();
}
