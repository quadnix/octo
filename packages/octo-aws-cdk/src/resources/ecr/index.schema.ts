import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @group Resources/Ecr
 */
export class EcrImageSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: EcrImageSchema['properties']): string[] => [value.awsAccountId, value.awsRegionId, value.imageId],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    imageId: string;
  }>();

  @Validate({
    destruct: (value: EcrImageSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.registryId) {
        subjects.push(value.registryId);
      }
      if (value.repositoryArn) {
        subjects.push(value.repositoryArn);
      }
      if (value.repositoryName) {
        subjects.push(value.repositoryName);
      }
      if (value.repositoryUri) {
        subjects.push(value.repositoryUri);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    registryId?: string;
    repositoryArn?: string;
    repositoryName?: string;
    repositoryUri?: string;
  }>();
}
