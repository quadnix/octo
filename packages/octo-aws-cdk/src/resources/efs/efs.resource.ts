import { AResource, IResource, Resource } from '@quadnix/octo';
import { IEfsProperties } from './efs.interface.js';

@Resource()
export class Efs extends AResource<Efs> {
  readonly MODEL_NAME: string = 'efs';

  constructor(resourceId: string, properties: IEfsProperties, parents: []) {
    super(resourceId, properties as unknown as IResource['properties'], parents);
  }
}
