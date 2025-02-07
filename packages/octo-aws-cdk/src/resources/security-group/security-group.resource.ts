import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import type { VpcSchema } from '../vpc/vpc.schema.js';
import { SecurityGroupSchema } from './security-group.schema.js';

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
}
