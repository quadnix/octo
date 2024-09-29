import { AResource, Resource } from '@quadnix/octo';
import type { IEcrImageProperties, IEcrImageResponse } from './ecr-image.interface.js';

@Resource('@octo', 'ecr-image')
export class EcrImage extends AResource<EcrImage> {
  declare properties: IEcrImageProperties;
  declare response: IEcrImageResponse;

  constructor(resourceId: string, properties: IEcrImageProperties) {
    super(resourceId, properties, []);
  }
}
