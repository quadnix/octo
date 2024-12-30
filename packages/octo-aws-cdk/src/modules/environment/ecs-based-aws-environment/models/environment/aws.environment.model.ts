import { Environment, Model } from '@quadnix/octo';
import { AwsEnvironmentSchema } from './aws.environment.schema.js';

@Model<AwsEnvironment>('@octo', 'environment', AwsEnvironmentSchema)
export class AwsEnvironment extends Environment {
  static override async unSynth(awsEnvironment: AwsEnvironmentSchema): Promise<AwsEnvironment> {
    return new AwsEnvironment(awsEnvironment.environmentName);
  }
}
