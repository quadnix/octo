import { AResource, Resource } from '@quadnix/octo';
import { SecurityGroupSchema, SecurityGroupVpc } from './security-group.schema.js';

@Resource<SecurityGroup>('@octo', 'security-group', SecurityGroupSchema)
export class SecurityGroup extends AResource<SecurityGroupSchema, SecurityGroup> {
  declare properties: SecurityGroupSchema['properties'];
  declare response: SecurityGroupSchema['response'];

  constructor(resourceId: string, properties: SecurityGroupSchema['properties'], parents: [SecurityGroupVpc]) {
    super(resourceId, properties, parents);
  }
}
