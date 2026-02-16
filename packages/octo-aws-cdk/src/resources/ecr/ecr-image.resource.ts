import { AResource, type Diff, DiffUtility, Resource, ResourceError } from '@quadnix/octo';
import { EcrImageSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EcrImage>('@octo', 'ecr-image', EcrImageSchema)
export class EcrImage extends AResource<EcrImageSchema, EcrImage> {
  declare properties: EcrImageSchema['properties'];
  declare response: EcrImageSchema['response'];

  constructor(resourceId: string, properties: EcrImageSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(previous: EcrImage): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update ECR immutable properties once it has been created!', this);
    }

    return [];
  }
}
