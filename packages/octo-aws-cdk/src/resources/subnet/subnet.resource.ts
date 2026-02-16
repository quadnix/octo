import { AResource, Diff, DiffUtility, MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import type { VpcSchema } from '../vpc/index.schema.js';
import { SubnetSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Subnet>('@octo', 'subnet', SubnetSchema)
export class Subnet extends AResource<SubnetSchema, Subnet> {
  declare parents: [MatchingResource<VpcSchema>];
  declare properties: SubnetSchema['properties'];
  declare response: SubnetSchema['response'];

  constructor(resourceId: string, properties: SubnetSchema['properties'], parents: [MatchingResource<VpcSchema>]) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: Subnet): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update Subnet immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }
}
