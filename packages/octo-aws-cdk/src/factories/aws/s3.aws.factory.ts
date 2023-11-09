import { S3Client } from '@aws-sdk/client-s3';
import { Factory } from '@quadnix/octo';
import { AwsFactory } from './aws.abstract.factory.js';

@Factory<S3Client>(S3Client)
export class S3AwsFactory extends AwsFactory {
  static override createInstance<S3Client>(awsRegionId: string): S3Client {
    return new S3Client({ region: awsRegionId }) as S3Client;
  }
}
