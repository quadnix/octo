import { IResource, Resource } from '@quadnix/octo';
import { IVpcProperties } from './vpc.interface';

export class Vpc extends Resource<Vpc> {
  readonly MODEL_NAME: string = 'vpc';

  constructor(resourceId: string, properties: IVpcProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }
}
