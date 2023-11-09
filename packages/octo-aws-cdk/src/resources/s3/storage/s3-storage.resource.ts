import { AResource, IResource, Resource } from '@quadnix/octo';
import { IS3StorageProperties } from './s3-storage.interface.js';

@Resource()
export class S3Storage extends AResource<S3Storage> {
  readonly MODEL_NAME: string = 's3-storage';

  constructor(resourceId: string, properties: IS3StorageProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }
}
