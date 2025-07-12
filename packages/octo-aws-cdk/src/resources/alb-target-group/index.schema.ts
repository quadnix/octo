import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * Defines how the health endpoint of the target should be called.
 *
 * @group Resources/AlbTargetGroup
 *
 * @hideconstructor
 */
export class AlbTargetGroupHealthCheckSchema {
  /**
   * The approximate amount of time, in seconds, between health checks of an individual target.
   */
  @Validate({ options: { maxLength: 60, minLength: 30 } })
  HealthCheckIntervalSeconds = Schema<number>();

  /**
   * The path of the health check endpoint.
   */
  @Validate({ options: { regex: /^\/([\w-]*)$/ } })
  HealthCheckPath = Schema<string>();

  /**
   * The port of the health check endpoint.
   */
  @Validate({ options: { maxLength: 65535, minLength: 0 } })
  HealthCheckPort = Schema<number>();

  /**
   * The protocol of the health check endpoint.
   * Possible values are `HTTP`.
   */
  @Validate({ options: { regex: /^HTTP$/ } })
  HealthCheckProtocol = Schema<'HTTP'>();

  /**
   * The amount of time, in seconds, during which no response means a failed health check.
   */
  @Validate({ options: { maxLength: 5, minLength: 5 } })
  HealthCheckTimeoutSeconds = Schema<number>();

  /**
   * The number of consecutive health checks successes required before considering the target healthy.
   */
  @Validate({ options: { maxLength: 2, minLength: 2 } })
  HealthyThresholdCount = Schema<number>();

  /**
   * The HTTP status codes to use when checking for a successful response from a target.
   */
  @Validate({
    destruct: (value: AlbTargetGroupHealthCheckSchema['Matcher']): number[] => [value.HttpCode],
    options: { maxLength: 299, minLength: 200 },
  })
  Matcher = Schema<{ HttpCode: number }>();

  /**
   * The number of consecutive health check failures required before considering the target unhealthy.
   */
  @Validate({ options: { maxLength: 2, minLength: 2 } })
  UnhealthyThresholdCount = Schema<number>();
}

/**
 * The `AlbTargetGroupSchema` class is the schema for the `AlbTargetGroup` resource,
 * which represents the AWS Application Load Balancer Target Group resource.
 * This resource can create a alb target group in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/elastic-load-balancing-v2/).
 *
 * @group Resources/AlbTargetGroup
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   vpc((Vpc)) --> alb_target_group((Alb<br>Target<br>Group))
 * ```
 * @overrideProperty resourceId - The resource id is of format `alb-target-group-<execution-id>`
 */
export class AlbTargetGroupSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.healthCheck` - The health check configuration.
   * See {@link AlbTargetGroupHealthCheckSchema} for options.
   * * `properties.IpAddressType` - The IP address type. Possible values are `ipv4`.
   * * `properties.Name` - The name of the target group. The name should be unique across all your target groups
   * since the target groups are referenced in the ALB listener by name.
   * * `properties.Port` - The port of the target group. This port is where the target will receive traffic.
   * If your target has multiple ports, you must create a separate target group for each port.
   * * `properties.Protocol` - The protocol of the target group. Possible values are `HTTP`.
   * * `properties.ProtocolVersion` - The protocol version of the target group. Possible values are `HTTP1`.
   * * `properties.TargetType` - The target type of the target group. Possible values are `ip`.
   */
  @Validate<unknown>([
    {
      destruct: (value: AlbTargetGroupSchema['properties']): string[] => [
        value.awsAccountId,
        value.awsRegionId,
        value.IpAddressType,
        value.Protocol,
        value.ProtocolVersion,
        value.TargetType,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: AlbTargetGroupSchema['properties']): string[] => [value.Name],
      options: { maxLength: 32, minLength: 1 },
    },
    {
      destruct: (value: AlbTargetGroupSchema['properties']): number[] => [value.Port],
      options: { maxLength: 65535, minLength: 0 },
    },
    {
      destruct: (value: AlbTargetGroupSchema['properties']): AlbTargetGroupHealthCheckSchema[] =>
        value.healthCheck ? [value.healthCheck] : [],
      options: { isSchema: { schema: AlbTargetGroupHealthCheckSchema } },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    healthCheck?: AlbTargetGroupHealthCheckSchema;
    IpAddressType: 'ipv4';
    Name: string;
    Port: number;
    Protocol: 'HTTP';
    ProtocolVersion: 'HTTP1';
    TargetType: 'ip';
  }>();

  /**
   * Saved response.
   * * `response.TargetGroupArn` - The ARN of the target group.
   */
  @Validate({
    destruct: (value: AlbTargetGroupSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.TargetGroupArn) {
        subjects.push(value.TargetGroupArn);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    TargetGroupArn?: string;
  }>();
}
