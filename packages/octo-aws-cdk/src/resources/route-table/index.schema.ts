import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class RouteTableSchema extends BaseResourceSchema {
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

  @Validate({
    destruct: (value: RouteTableSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.RouteTableArn) {
        subjects.push(value.RouteTableArn);
      }
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
    RouteTableArn?: string;
    RouteTableId?: string;
    subnetAssociationId?: string;
  }>();
}
