import { AResource, Resource } from '@quadnix/octo';
import { EcrImageSchema } from './ecr-image.schema.js';

@Resource<EcrImage>('@octo', 'ecr-image', EcrImageSchema)
export class EcrImage extends AResource<EcrImageSchema, EcrImage> {
  declare properties: EcrImageSchema['properties'];
  declare response: EcrImageSchema['response'];

  constructor(resourceId: string, properties: EcrImageSchema['properties']) {
    super(resourceId, properties, []);
  }
}
