import { AResource, Resource } from '@quadnix/octo';
import { S3StorageSchema } from './s3-storage.schema.js';

@Resource<S3Storage>('@octo', 's3-storage', S3StorageSchema)
export class S3Storage extends AResource<S3StorageSchema, S3Storage> {
  declare properties: S3StorageSchema['properties'];
  declare response: S3StorageSchema['response'];

  constructor(resourceId: string, properties: S3StorageSchema['properties']) {
    super(resourceId, properties, []);
  }
}
