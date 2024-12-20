import { AResource, Resource, getSchemaInstance } from '@quadnix/octo';
import assert from 'node:assert';
import {
  RouteTableInternetGateway,
  RouteTableInternetGatewaySchema,
  RouteTableSchema,
  RouteTableSubnet,
  RouteTableSubnetSchema,
  RouteTableVpc,
  RouteTableVpcSchema,
} from './route-table.schema.js';

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
    getSchemaInstance(RouteTableVpcSchema, parents[0].synth() as unknown as Record<string, unknown>);
    assert.strictEqual((parents[1].constructor as typeof AResource).NODE_NAME, 'internet-gateway');
    getSchemaInstance(RouteTableInternetGatewaySchema, parents[1].synth() as unknown as Record<string, unknown>);
    assert.strictEqual((parents[2].constructor as typeof AResource).NODE_NAME, 'subnet');
    getSchemaInstance(RouteTableSubnetSchema, parents[2].synth() as unknown as Record<string, unknown>);

    super(resourceId, properties, parents);
  }

  static override async unSynth(
    _deserializationClass: any,
    resource: RouteTableSchema,
    parentContexts: string[],
    deReferenceResource: (context: string) => Promise<any>,
  ): Promise<RouteTable> {
    const parents = await Promise.all(parentContexts.map((p) => deReferenceResource(p)));
    const vpc = parents.find((p) => p.constructor.NODE_NAME === 'vpc');
    const internetGateway = parents.find((p) => p.constructor.NODE_NAME === 'internet-gateway');
    const subnet = parents.find((p) => p.constructor.NODE_NAME === 'subnet');

    const newResource = new RouteTable(resource.resourceId, resource.properties, [vpc, internetGateway, subnet]);
    for (const key of Object.keys(resource.response)) {
      newResource.response[key] = resource.response[key];
    }
    return newResource;
  }
}
