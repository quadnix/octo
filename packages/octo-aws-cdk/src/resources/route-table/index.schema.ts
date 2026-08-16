import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `RouteTableSchema` class is the schema for the `RouteTable` resource,
 * which represents the AWS VPC Route Table resource.
 * Terraform provisions it as
 * [`aws_route_table`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route_table) and
 * [`aws_route_table_association`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/route_table_association).
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
   * * `response.RouteTableId` - The route table ID.
   * * `response.subnetAssociationId` - The association ID representing relationship between route table and subnet.
   */
  @Validate({
    destruct: (value: RouteTableSchema['response']): string[] => {
      const subjects: string[] = [];
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
    RouteTableId?: string;
    subnetAssociationId?: string;
  }>({
    RouteTableId: 'rtb-0123456789abcdef0',
    subnetAssociationId: 'rtbassoc-0123456789abcdef0',
  });
}
