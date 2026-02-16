import { AResource, Diff, DiffUtility, Resource, ResourceError } from '@quadnix/octo';
import { EfsSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Efs>('@octo', 'efs', EfsSchema)
export class Efs extends AResource<EfsSchema, Efs> {
  declare properties: EfsSchema['properties'];
  declare response: EfsSchema['response'];

  constructor(resourceId: string, properties: EfsSchema['properties'], parents: []) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: Efs): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update EFS immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }
}
