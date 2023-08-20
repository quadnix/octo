import { Resource } from '@quadnix/octo';
import { IS3WebsiteProperties } from './s3-website.interface';

export class S3Website extends Resource<S3Website> {
  readonly MODEL_NAME: string = 's3-website';

  constructor(resourceId: string, properties: IS3WebsiteProperties) {
    super(resourceId);

    this.properties.Bucket = properties.Bucket;
    this.properties.ErrorDocument = properties.ErrorDocument;
    this.properties.IndexDocument = properties.IndexDocument;
    this.properties.manifestDiff = JSON.stringify(properties.manifestDiff);
  }
}
