import { AResource, Diff, DiffUtility, Resource, ResourceError } from '@quadnix/octo';
import { VpcSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Vpc>('@octo', 'vpc', VpcSchema)
export class Vpc extends AResource<VpcSchema, Vpc> {
  declare properties: VpcSchema['properties'];
  declare response: VpcSchema['response'];

  constructor(resourceId: string, properties: VpcSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(previous: Vpc): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update VPC immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }
}
