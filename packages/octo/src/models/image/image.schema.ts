import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

/**
 * Schema of the {@link Image} model.
 *
 * @group Models/Image
 */
export class ImageSchema {
  /**
   * The family this image belongs to, i.e. the repository name shared by all of its versions.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  imageFamily = Schema<string>();

  /**
   * An imageId is the unique identifier for this image.
   * - Format of imageId is `{imageFamily}/{imageName}`
   */
  imageId = Schema<string>();

  /**
   * The name of this image within its family, i.e. its version or tag.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z@][\w\-/]*[a-zA-Z0-9]$/ } })
  imageName = Schema<string>();
}
