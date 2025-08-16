import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

export class ImageSchema {
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  imageFamily = Schema<string>();

  /**
   * An imageId is the unique identifier for this image.
   * - Format of imageId is `{imageFamily}/{imageName}`
   */
  imageId = Schema<string>();

  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z@][\w\-/]*[a-zA-Z0-9]$/ } })
  imageName = Schema<string>();
}
