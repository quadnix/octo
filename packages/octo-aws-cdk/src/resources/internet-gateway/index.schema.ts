import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `InternetGatewaySchema` class is the schema for the `InternetGateway` resource,
 * which represents the AWS VPC Internet Gateway resource.
 * This resource can create a internet gateway in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ec2/).
 *
 * @group Resources/InternetGateway
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   vpc((Vpc)) --> igw((Internet<br>Gateway))
 * ```
 * @overrideProperty resourceId - The resource id is of format `igw-<region-id>`
 */
export class InternetGatewaySchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.internetGatewayName` - The name of the internet gateway.
   */
  @Validate({
    destruct: (value: InternetGatewaySchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.internetGatewayName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    internetGatewayName: string;
  }>();

  /**
   * Saved response.
   * * `response.InternetGatewayArn` - The ARN of the internet gateway.
   * * `response.InternetGatewayId` - The ID of the internet gateway.
   */
  @Validate({
    destruct: (value: InternetGatewaySchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.InternetGatewayArn) {
        subjects.push(value.InternetGatewayArn);
      }
      if (value.InternetGatewayId) {
        subjects.push(value.InternetGatewayId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    InternetGatewayArn?: string;
    InternetGatewayId?: string;
  }>();
}
