import { Environment, Model } from '@quadnix/octo';
import { AwsEnvironmentSchema } from './aws.environment.schema.js';

@Model<AwsEnvironment>('@octo', 'environment', AwsEnvironmentSchema)
export class AwsEnvironment extends Environment {
  static override async unSynth(awsEnvironment: AwsEnvironmentSchema): Promise<AwsEnvironment> {
    const newEnvironment = new AwsEnvironment(awsEnvironment.environmentName);

    for (const [key, value] of Object.entries(awsEnvironment.environmentVariables)) {
      newEnvironment.environmentVariables.set(key, value);
    }

    return newEnvironment;
  }
}
