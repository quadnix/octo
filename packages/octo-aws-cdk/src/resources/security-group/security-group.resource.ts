import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import { SecurityGroupSchema, type SecurityGroupVpcSchema } from './security-group.schema.js';

@Resource<SecurityGroup>('@octo', 'security-group', SecurityGroupSchema)
export class SecurityGroup extends AResource<SecurityGroupSchema, SecurityGroup> {
  declare parents: [MatchingResource<SecurityGroupVpcSchema>];
  declare properties: SecurityGroupSchema['properties'];
  declare response: SecurityGroupSchema['response'];

  constructor(
    resourceId: string,
    properties: SecurityGroupSchema['properties'],
    parents: [MatchingResource<SecurityGroupVpcSchema>],
  ) {
    super(resourceId, properties, parents);
  }
}
