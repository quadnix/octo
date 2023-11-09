import { IAMClient } from '@aws-sdk/client-iam';
import { Factory } from '@quadnix/octo';
import { AwsFactory } from './aws.abstract.factory.js';

@Factory<IAMClient>(IAMClient)
export class IAMAwsFactory extends AwsFactory {
  static override async create<IAMClient>(): Promise<IAMClient> {
    return super.create('global');
  }

  static override createInstance<IAMClient>(): IAMClient {
    return new IAMClient({}) as IAMClient;
  }
}
