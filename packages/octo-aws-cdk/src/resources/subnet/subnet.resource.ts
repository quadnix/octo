import { AResource, Resource } from '@quadnix/octo';
import * as assert from 'node:assert';
import { SubnetSchema, type SubnetVpc } from './subnet.schema.js';

@Resource<Subnet>('@octo', 'subnet', SubnetSchema)
export class Subnet extends AResource<SubnetSchema, Subnet> {
  declare properties: SubnetSchema['properties'];
  declare response: SubnetSchema['response'];

  constructor(resourceId: string, properties: SubnetSchema['properties'], parents: [SubnetVpc]) {
    assert.strictEqual((parents[0].constructor as typeof AResource).NODE_NAME, 'vpc');

    super(resourceId, properties, parents);
  }
}
