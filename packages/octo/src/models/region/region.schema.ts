import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

/**
 * Schema of the {@link Region} model.
 *
 * @group Models/Region
 */
export class RegionSchema {
  /**
   * The ID of the region, unique within its {@link Account}.
   * It is not required to be the cloud provider's region name - a module maps it to one.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  regionId = Schema<string>();
}
