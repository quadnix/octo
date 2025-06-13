import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class EcsClusterSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: EcsClusterSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.clusterName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    clusterName: string;
  }>();

  @Validate({
    destruct: (value: EcsClusterSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.clusterArn) {
        subjects.push(value.clusterArn);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    clusterArn?: string;
  }>();
}
