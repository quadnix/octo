import { AResource, type Diff, Resource } from '@quadnix/octo';
import { EcrImageSchema } from './index.schema.js';

/**
 * @group Resources/Ecr
 */
@Resource<EcrImage>('@octo', 'ecr-image', EcrImageSchema)
export class EcrImage extends AResource<EcrImageSchema, EcrImage> {
  declare properties: EcrImageSchema['properties'];
  declare response: EcrImageSchema['response'];

  constructor(resourceId: string, properties: EcrImageSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(): Promise<Diff[]> {
    return [];
  }
}
