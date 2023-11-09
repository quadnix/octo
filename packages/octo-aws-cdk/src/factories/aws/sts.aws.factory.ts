import { STSClient } from '@aws-sdk/client-sts';
import { Factory } from '@quadnix/octo';
import { AwsFactory } from './aws.abstract.factory.js';

@Factory<STSClient>(STSClient)
export class STSAwsFactory extends AwsFactory {
  static override createInstance<STSClient>(awsRegionId: string): STSClient {
    return new STSClient({ region: awsRegionId }) as STSClient;
  }
}
