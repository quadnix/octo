import { EC2Client } from '@aws-sdk/client-ec2';
import { Factory } from '@quadnix/octo';
import { AwsFactory } from './aws.abstract.factory.js';

@Factory<EC2Client>(EC2Client)
export class EC2AwsFactory extends AwsFactory {
  static override createInstance<EC2Client>(awsRegionId: string): EC2Client {
    return new EC2Client({ region: awsRegionId }) as EC2Client;
  }
}
