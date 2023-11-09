import { AResource, IResource, Resource } from '@quadnix/octo';
import { IEcrImageProperties } from './ecr-image.interface.js';

@Resource()
export class EcrImage extends AResource<EcrImage> {
  readonly MODEL_NAME: string = 'ecr-image';

  constructor(resourceId: string, properties: IEcrImageProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }
}
