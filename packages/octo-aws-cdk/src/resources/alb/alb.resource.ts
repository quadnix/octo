import { AResource, type Diff, DiffUtility, type MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import type { InternetGatewaySchema } from '../internet-gateway/index.schema.js';
import type { SecurityGroupSchema } from '../security-group/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import { AlbSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Alb>('@octo', 'alb', AlbSchema)
export class Alb extends AResource<AlbSchema, Alb> {
  declare parents: [
    MatchingResource<InternetGatewaySchema>,
    MatchingResource<SecurityGroupSchema>,
    ...MatchingResource<SubnetSchema>[],
  ];
  declare properties: AlbSchema['properties'];
  declare response: AlbSchema['response'];

  constructor(
    resourceId: string,
    properties: AlbSchema['properties'],
    parents: [
      MatchingResource<InternetGatewaySchema>,
      MatchingResource<SecurityGroupSchema>,
      ...MatchingResource<SubnetSchema>[],
    ],
  ) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: Alb): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update ALB immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }
}
