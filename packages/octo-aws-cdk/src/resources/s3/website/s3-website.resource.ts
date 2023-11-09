import { AResource, IResource, Resource } from '@quadnix/octo';
import { IS3WebsiteProperties } from './s3-website.interface.js';

@Resource()
export class S3Website extends AResource<S3Website> {
  readonly MODEL_NAME: string = 's3-website';

  constructor(resourceId: string, properties: IS3WebsiteProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }
}
