import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class InternetGatewaySchema extends BaseResourceSchema {
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

  @Validate({
    destruct: (value: InternetGatewaySchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.InternetGatewayId) {
        subjects.push(value.InternetGatewayId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    InternetGatewayId: string;
  }>();
}
