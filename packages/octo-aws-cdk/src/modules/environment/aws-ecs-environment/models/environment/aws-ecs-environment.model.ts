import { Environment, Model } from '@quadnix/octo';
import { AwsEcsEnvironmentSchema } from './aws-ecs-environment.schema.js';

/**
 * @internal
 */
@Model<AwsEcsEnvironment>('@octo', 'environment', AwsEcsEnvironmentSchema)
export class AwsEcsEnvironment extends Environment {
  static override async unSynth(awsEnvironment: AwsEcsEnvironmentSchema): Promise<AwsEcsEnvironment> {
    const newEnvironment = new AwsEcsEnvironment(awsEnvironment.environmentName);

    for (const [key, value] of Object.entries(awsEnvironment.environmentVariables)) {
      newEnvironment.environmentVariables.set(key, value);
    }

    return newEnvironment;
  }
}
