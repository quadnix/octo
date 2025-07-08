import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import { NetworkAclUtility } from '../../utilities/network-acl/network-acl.utility.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import type { VpcSchema } from '../vpc/index.schema.js';
import { NetworkAclSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<NetworkAcl>('@octo', 'network-acl', NetworkAclSchema)
export class NetworkAcl extends AResource<NetworkAclSchema, NetworkAcl> {
  declare parents: [MatchingResource<VpcSchema>, MatchingResource<SubnetSchema>];
  declare properties: NetworkAclSchema['properties'];
  declare response: NetworkAclSchema['response'];

  constructor(
    resourceId: string,
    properties: NetworkAclSchema['properties'],
    parents: [MatchingResource<VpcSchema>, MatchingResource<SubnetSchema>],
  ) {
    NetworkAclUtility.assignRuleNumber(properties.entries);
    super(resourceId, properties, parents);
  }

  updateNaclEntries(entries: NetworkAclSchema['properties']['entries']): void {
    this.properties.entries.push(...entries);
    NetworkAclUtility.assignRuleNumber(this.properties.entries);
  }
}
