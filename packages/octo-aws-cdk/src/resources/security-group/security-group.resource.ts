import { AResource, Resource } from '@quadnix/octo';
import assert from 'node:assert';
import { SecurityGroupSchema, SecurityGroupVpc } from './security-group.schema.js';

@Resource<SecurityGroup>('@octo', 'security-group', SecurityGroupSchema)
export class SecurityGroup extends AResource<SecurityGroupSchema, SecurityGroup> {
  declare properties: SecurityGroupSchema['properties'];
  declare response: SecurityGroupSchema['response'];

  constructor(resourceId: string, properties: SecurityGroupSchema['properties'], parents: [SecurityGroupVpc]) {
    assert.strictEqual((parents[0].constructor as typeof AResource).NODE_NAME, 'vpc');

    super(resourceId, properties, parents);
  }
}
