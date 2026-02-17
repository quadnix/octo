import {
  AResource,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  ResourceError,
  hasNodeName,
} from '@quadnix/octo';
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

  override async diff(previous: Alb): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    let shouldConsolidateSubnetDiffs = false;
    let shouldConsolidateSecurityGroupDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'subnet')) {
        // Consolidate all Subnet parent updates into a single UPDATE diff.
        shouldConsolidateSubnetDiffs = true;
        diffs.splice(i, 1);
      } else if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'security-group')) {
        // Consolidate all Security-Group parent updates into a single UPDATE diff.
        shouldConsolidateSecurityGroupDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateSubnetDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'parent', 'subnets'));
    }
    if (shouldConsolidateSecurityGroupDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'parent', 'security-groups'));
    }

    return diffs;
  }

  override async diffProperties(previous: Alb): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update ALB immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }
}
