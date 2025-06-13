import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class EfsSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value: EfsSchema['properties']): string[] => [
      value.awsAccountId,
      value.awsRegionId,
      value.filesystemName,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    filesystemName: string;
  }>();

  @Validate({
    destruct: (value: EfsSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.FileSystemArn) {
        subjects.push(value.FileSystemArn);
      }
      if (value.FileSystemId) {
        subjects.push(value.FileSystemId);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    FileSystemArn?: string;
    FileSystemId?: string;
  }>();
}
