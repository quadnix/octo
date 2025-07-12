import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `AlbSchema` class is the schema for the `Alb` resource,
 * which represents the AWS Application Load Balancer resource.
 * This resource can create an Application Load Balancer in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/elastic-load-balancing-v2/).
 *
 * @group Resources/Alb
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   sg((Security<br>Group)) --> alb((Alb))
 *   subnet((Subnet)) --> alb
 * ```
 * @overrideProperty resourceId - The resource id is of format `alb-<region-id>-<alb-name>`
 */
export class AlbSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.IpAddressType` - The IP address type. Possible values are `dualstack`.
   * * `properties.Name` - The name of the ALB.
   * * `properties.Scheme` - The scheme of the ALB. Possible values are `internet-facing`.
   * * `properties.Type` - The type of the ALB. Possible values are `application`.
   */
  @Validate({
    destruct: (value: AlbSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.IpAddressType,
      value.Name,
      value.Scheme,
      value.Type,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    IpAddressType: 'dualstack';
    Name: string;
    Scheme: 'internet-facing';
    Type: 'application';
  }>();

  /**
   * Saved response.
   * * `response.DNSName` - The DNS name of the ALB.
   * * `response.LoadBalancerArn` - The ARN of the ALB.
   */
  @Validate({
    destruct: (value: AlbSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.DNSName) {
        subjects.push(value.DNSName);
      }
      if (value.LoadBalancerArn) {
        subjects.push(value.LoadBalancerArn);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    DNSName?: string;
    LoadBalancerArn?: string;
  }>();
}
