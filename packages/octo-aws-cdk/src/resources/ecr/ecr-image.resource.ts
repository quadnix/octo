import { AResource, Resource } from '@quadnix/octo';
import type { IEcrImageProperties, IEcrImageResponse } from './ecr-image.interface.js';

@Resource()
export class EcrImage extends AResource<EcrImage> {
  readonly NODE_NAME: string = 'ecr-image';

  declare properties: IEcrImageProperties;
  declare response: IEcrImageResponse;

  constructor(resourceId: string, properties: IEcrImageProperties) {
    super(resourceId, properties, []);
  }
}
