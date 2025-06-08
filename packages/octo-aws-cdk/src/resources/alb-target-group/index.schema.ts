import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class AlbTargetGroupHealthCheckSchema {
  @Validate({ options: { maxLength: 60, minLength: 30 } })
  HealthCheckIntervalSeconds: number;

  @Validate({ options: { regex: /^\/([\w-]*)$/ } })
  HealthCheckPath: string;

  @Validate({ options: { maxLength: 65535, minLength: 0 } })
  HealthCheckPort: number;

  @Validate({ options: { regex: /^HTTP$/ } })
  HealthCheckProtocol: 'HTTP';

  @Validate({ options: { maxLength: 5, minLength: 5 } })
  HealthCheckTimeoutSeconds: number;

  @Validate({ options: { maxLength: 2, minLength: 2 } })
  HealthyThresholdCount: number;

  @Validate({
    destruct: (value: AlbTargetGroupHealthCheckSchema['Matcher']): number[] => [value.HttpCode],
    options: { maxLength: 299, minLength: 200 },
  })
  Matcher: {
    HttpCode: number;
  };

  @Validate({ options: { maxLength: 2, minLength: 2 } })
  UnhealthyThresholdCount: number;
}

export class AlbTargetGroupSchema extends BaseResourceSchema {
  @Validate<unknown>([
    {
      destruct: (value: AlbTargetGroupSchema['properties']): string[] => [
        value.awsAccountId,
        value.awsRegionId,
        value.IpAddressType,
        value.Name,
        value.Protocol,
        value.ProtocolVersion,
        value.TargetType,
      ],
      options: { minLength: 1 },
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
    TargetGroupArn: string;
  }>();
}
