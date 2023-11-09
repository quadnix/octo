import { ECRClient } from '@aws-sdk/client-ecr';
import { Factory } from '@quadnix/octo';
import { AwsFactory } from './aws.abstract.factory.js';

@Factory<ECRClient>(ECRClient)
export class ECRAwsFactory extends AwsFactory {
  static override createInstance<ECRClient>(awsRegionId: string): ECRClient {
    return new ECRClient({ region: awsRegionId }) as ECRClient;
  }
}
