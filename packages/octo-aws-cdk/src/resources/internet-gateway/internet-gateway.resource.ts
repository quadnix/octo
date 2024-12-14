import { AResource, Resource } from '@quadnix/octo';
import assert from 'node:assert';
import { InternetGatewaySchema, type InternetGatewayVpc } from './internet-gateway.schema.js';

@Resource<InternetGateway>('@octo', 'internet-gateway', InternetGatewaySchema)
export class InternetGateway extends AResource<InternetGatewaySchema, InternetGateway> {
  declare properties: InternetGatewaySchema['properties'];
  declare response: InternetGatewaySchema['response'];

  constructor(resourceId: string, properties: InternetGatewaySchema['properties'], parents: [InternetGatewayVpc]) {
    assert.strictEqual((parents[0].constructor as typeof AResource).NODE_NAME, 'vpc');

    super(resourceId, properties, parents);
  }
}
