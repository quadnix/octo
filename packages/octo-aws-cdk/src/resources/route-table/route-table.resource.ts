import { AResource, Resource } from '@quadnix/octo';
import assert from 'node:assert';
import { RouteTableInternetGateway, RouteTableSchema, RouteTableSubnet, RouteTableVpc } from './route-table.schema.js';

@Resource<RouteTable>('@octo', 'route-table', RouteTableSchema)
export class RouteTable extends AResource<RouteTableSchema, RouteTable> {
  declare properties: RouteTableSchema['properties'];
  declare response: RouteTableSchema['response'];

  constructor(
    resourceId: string,
    properties: RouteTableSchema['properties'],
    parents: [RouteTableVpc, RouteTableInternetGateway, RouteTableSubnet],
  ) {
    assert.strictEqual((parents[0].constructor as typeof AResource).NODE_NAME, 'vpc');
    assert.strictEqual((parents[1].constructor as typeof AResource).NODE_NAME, 'internet-gateway');
    assert.strictEqual((parents[2].constructor as typeof AResource).NODE_NAME, 'subnet');

    super(resourceId, properties, parents);
  }
}
