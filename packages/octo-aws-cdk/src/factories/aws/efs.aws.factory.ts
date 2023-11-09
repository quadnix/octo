import { EFSClient } from '@aws-sdk/client-efs';
import { Factory } from '@quadnix/octo';
import { AwsFactory } from './aws.abstract.factory.js';

@Factory<EFSClient>(EFSClient)
export class EFSAwsFactory extends AwsFactory {
  static override createInstance<EFSClient>(awsRegionId: string): EFSClient {
    return new EFSClient({ region: awsRegionId }) as EFSClient;
  }
}
