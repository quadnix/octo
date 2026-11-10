import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `CloudWatchLogGroupSchema` class is the schema for the `CloudWatchLogGroup` resource, which
 * represents a CloudWatch Logs log group, and how long it keeps what is written to it. Terraform provisions
 * it as
 * [`aws_cloudwatch_log_group`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group).
 *
 * @group Resources/CloudWatchLogGroup
 *
 * @hideconstructor
 *
 * @overrideProperty resourceId - The resource id is of format `cloudwatch-log-group-<execution-id>`.
 */
export class CloudWatchLogGroupSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account id.
   * * `properties.awsRegionId` - The AWS region id.
   * * `properties.logGroupName` - The name of the log group. Part of its identity.
   * * `properties.retentionInDays` - How many days an event is kept before CloudWatch deletes it.
   */
  @Validate<unknown>([
    {
      destruct: (value: CloudWatchLogGroupSchema['properties']): string[] => [
        value.awsAccountId,
        value.awsRegionId,
        value.logGroupName,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: CloudWatchLogGroupSchema['properties']): string[] => [String(value.retentionInDays)],
      options: {
        regex: /^(1|3|5|7|14|30|60|90|120|150|180|365|400|545|731|1096|1827|2192|2557|2922|3288|3653)$/,
      },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    logGroupName: string;
    retentionInDays:
      | 1
      | 3
      | 5
      | 7
      | 14
      | 30
      | 60
      | 90
      | 120
      | 150
      | 180
      | 365
      | 400
      | 545
      | 731
      | 1096
      | 1827
      | 2192
      | 2557
      | 2922
      | 3288
      | 3653;
  }>();

  /**
   * Saved response.
   * * `response.Arn` - The ARN of the log group.
   * * `response.LogGroupName` - The name of the log group.
   */
  @Validate({
    destruct: (value: CloudWatchLogGroupSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.Arn) {
        subjects.push(value.Arn);
      }
      if (value.LogGroupName) {
        subjects.push(value.LogGroupName);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    Arn?: string;
    LogGroupName?: string;
  }>();
}
