import { ECSClient } from '@aws-sdk/client-ecs';
import { Factory } from '@quadnix/octo';
import { AwsFactory } from './aws.abstract.factory.js';

@Factory<ECSClient>(ECSClient)
export class ECSAwsFactory extends AwsFactory {
  static override createInstance<ECSClient>(awsRegionId: string): ECSClient {
    return new ECSClient({ region: awsRegionId }) as ECSClient;
  }
}
