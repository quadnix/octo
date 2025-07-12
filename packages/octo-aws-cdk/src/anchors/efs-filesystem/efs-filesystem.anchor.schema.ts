import { BaseAnchorSchema, type Filesystem, Schema, Validate } from '@quadnix/octo';

/**
 * This anchor is associated with a {@link Filesystem} model representing an AWS EFS filesystem.
 *
 * @group Anchors/EfsFilesystem
 *
 * @hideconstructor
 */
export class EfsFilesystemAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Filesystem;

  /**
   * Input properties.
   * * `properties.filesystemName`: The name of the EFS filesystem.
   */
  @Validate({
    destruct: (value: EfsFilesystemAnchorSchema['properties']): string[] => [value.filesystemName],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    filesystemName: string;
  }>();
}
