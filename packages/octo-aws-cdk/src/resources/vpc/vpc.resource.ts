import { AResource, Resource } from '@quadnix/octo';
import type { IVpcProperties, IVpcResponse } from './vpc.interface.js';

@Resource('@octo', 'vpc')
export class Vpc extends AResource<Vpc> {
  declare properties: IVpcProperties;
  declare response: IVpcResponse;

  constructor(resourceId: string, properties: IVpcProperties) {
    super(resourceId, properties, []);
  }
}
