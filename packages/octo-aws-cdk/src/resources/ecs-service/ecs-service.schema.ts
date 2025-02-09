import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class EcsServiceSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: EcsServiceSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      String(value.desiredCount),
      value.serviceName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    desiredCount: number;
    serviceName: string;
  }>();

  @Validate({
    destruct: (value: EcsServiceSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.serviceArn) {
        subjects.push(value.serviceArn);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    serviceArn: string;
  }>();
}
