import { AResource, Resource } from '@quadnix/octo';
import type { IEfsProperties, IEfsResponse } from './efs.interface.js';

@Resource()
export class Efs extends AResource<Efs> {
  readonly MODEL_NAME: string = 'efs';

  declare properties: IEfsProperties;
  declare response: IEfsResponse;

  constructor(resourceId: string, properties: IEfsProperties, parents: []) {
    super(resourceId, properties, parents);
  }
}
