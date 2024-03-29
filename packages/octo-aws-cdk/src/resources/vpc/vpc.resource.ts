import { AResource, IResource, Resource } from '@quadnix/octo';
import { IVpcProperties } from './vpc.interface.js';

@Resource()
export class Vpc extends AResource<Vpc> {
  readonly MODEL_NAME: string = 'vpc';

  constructor(resourceId: string, properties: IVpcProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }
}
