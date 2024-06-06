import { AResource, type IResource, Resource } from '@quadnix/octo';
import type { IEfsProperties } from './efs.interface.js';

@Resource()
export class Efs extends AResource<Efs> {
  readonly MODEL_NAME: string = 'efs';

  constructor(resourceId: string, properties: IEfsProperties, parents: []) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
