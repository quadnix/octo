import { AResource, Resource } from '@quadnix/octo';
import { VpcSchema } from './vpc.schema.js';

@Resource<Vpc>('@octo', 'vpc', VpcSchema)
export class Vpc extends AResource<VpcSchema, Vpc> {
  declare properties: VpcSchema['properties'];
  declare response: VpcSchema['response'];

  constructor(resourceId: string, properties: VpcSchema['properties']) {
    super(resourceId, properties, []);
  }
}
