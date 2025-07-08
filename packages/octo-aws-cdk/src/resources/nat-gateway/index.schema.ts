import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @group Resources/NatGateway
 */
export class NatGatewaySchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: NatGatewaySchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.ConnectivityType,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    ConnectivityType: 'public';
  }>();

  @Validate({
    destruct: (value: NatGatewaySchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.AllocationId) {
        subjects.push(value.AllocationId);
      }
      if (value.NatGatewayArn) {
        subjects.push(value.NatGatewayArn);
      }
      if (value.NatGatewayId) {
        subjects.push(value.NatGatewayId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    AllocationId?: string;
    NatGatewayArn?: string;
    NatGatewayId?: string;
  }>();
}
