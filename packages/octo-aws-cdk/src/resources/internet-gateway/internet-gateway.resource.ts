import { AResource, Diff, DiffUtility, type MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import type { VpcSchema } from '../vpc/index.schema.js';
import { InternetGatewaySchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<InternetGateway>('@octo', 'internet-gateway', InternetGatewaySchema)
export class InternetGateway extends AResource<InternetGatewaySchema, InternetGateway> {
  declare parents: [MatchingResource<VpcSchema>];
  declare properties: InternetGatewaySchema['properties'];
  declare response: InternetGatewaySchema['response'];

  constructor(
    resourceId: string,
    properties: InternetGatewaySchema['properties'],
    parents: [MatchingResource<VpcSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: InternetGateway): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update Internet Gateway immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }
}
