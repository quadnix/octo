import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

/**
 * Schema of the {@link Filesystem} model.
 *
 * @group Models/Filesystem
 */
export class FilesystemSchema {
  /**
   * The name of the filesystem, unique within its {@link Region}.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  filesystemName = Schema<string>();
}
