import { AResource, Resource } from '@quadnix/octo';
import { EfsSchema } from './efs.schema.js';

@Resource<Efs>('@octo', 'efs', EfsSchema)
export class Efs extends AResource<EfsSchema, Efs> {
  declare properties: EfsSchema['properties'];
  declare response: EfsSchema['response'];

  constructor(resourceId: string, properties: EfsSchema['properties'], parents: []) {
    super(resourceId, properties, parents);
  }
}
