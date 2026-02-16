import { AResource, Diff, DiffUtility, type MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import type { VpcSchema } from '../vpc/index.schema.js';
import { SecurityGroupSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<SecurityGroup>('@octo', 'security-group', SecurityGroupSchema)
export class SecurityGroup extends AResource<SecurityGroupSchema, SecurityGroup> {
  declare parents: [MatchingResource<VpcSchema>];
  declare properties: SecurityGroupSchema['properties'];
  declare response: SecurityGroupSchema['response'];

  constructor(
    resourceId: string,
    properties: SecurityGroupSchema['properties'],
    parents: [MatchingResource<VpcSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: SecurityGroup): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties, ['rules'])) {
      throw new ResourceError('Cannot update Security Group immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }
}
