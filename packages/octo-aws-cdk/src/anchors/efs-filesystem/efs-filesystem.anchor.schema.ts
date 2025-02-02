import { BaseAnchorSchema, Schema, Validate } from '@quadnix/octo';

export class EfsFilesystemAnchorSchema extends BaseAnchorSchema {
  @Validate({
    destruct: (value: EfsFilesystemAnchorSchema['properties']): string[] => [value.filesystemName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    filesystemName: string;
  }>();
}
