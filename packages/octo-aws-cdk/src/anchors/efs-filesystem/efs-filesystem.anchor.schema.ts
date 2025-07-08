import { BaseAnchorSchema, type Filesystem, Schema, Validate } from '@quadnix/octo';

/**
 * @group Anchors/EfsFilesystem
 */
export class EfsFilesystemAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Filesystem;

  @Validate({
    destruct: (value: EfsFilesystemAnchorSchema['properties']): string[] => [value.filesystemName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    filesystemName: string;
  }>();
}
