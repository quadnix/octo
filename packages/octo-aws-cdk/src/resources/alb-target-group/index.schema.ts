import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class AlbTargetGroupHealthCheckSchema {
  @Validate({ options: { maxLength: 60, minLength: 30 } })
  HealthCheckIntervalSeconds = Schema<number>();

  @Validate({ options: { regex: /^\/([\w-]*)$/ } })
  HealthCheckPath = Schema<string>();

  @Validate({ options: { maxLength: 65535, minLength: 0 } })
  HealthCheckPort = Schema<number>();

  @Validate({ options: { regex: /^HTTP$/ } })
  HealthCheckProtocol = Schema<'HTTP'>();

  @Validate({ options: { maxLength: 5, minLength: 5 } })
  HealthCheckTimeoutSeconds = Schema<number>();

  @Validate({ options: { maxLength: 2, minLength: 2 } })
  HealthyThresholdCount = Schema<number>();

  @Validate({
    destruct: (value: AlbTargetGroupHealthCheckSchema['Matcher']): number[] => [value.HttpCode],
    options: { maxLength: 299, minLength: 200 },
  })
  Matcher = Schema<{ HttpCode: number }>();

  @Validate({ options: { maxLength: 2, minLength: 2 } })
  UnhealthyThresholdCount = Schema<number>();
}

export class AlbTargetGroupSchema extends BaseResourceSchema {
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
