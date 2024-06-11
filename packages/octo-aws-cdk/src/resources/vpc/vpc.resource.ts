import { AResource, Resource } from '@quadnix/octo';
import type { IVpcProperties, IVpcResponse } from './vpc.interface.js';

@Resource()
export class Vpc extends AResource<Vpc> {
  readonly MODEL_NAME: string = 'vpc';

  declare properties: IVpcProperties;
  declare response: IVpcResponse;

  constructor(resourceId: string, properties: IVpcProperties) {
    super(resourceId, properties, []);
  }
}
