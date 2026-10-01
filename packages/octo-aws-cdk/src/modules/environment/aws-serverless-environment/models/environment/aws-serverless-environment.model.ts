import { Environment, Model } from '@quadnix/octo';
import { AwsServerlessEnvironmentSchema } from './aws-serverless-environment.schema.js';

/**
 * @internal
 */
@Model<AwsServerlessEnvironment>('@octo', 'environment', AwsServerlessEnvironmentSchema)
export class AwsServerlessEnvironment extends Environment {
  /**
   * @internal
   */
  static override async unSynth(environment: AwsServerlessEnvironmentSchema): Promise<AwsServerlessEnvironment> {
    const newEnvironment = new AwsServerlessEnvironment(environment.environmentName);

    for (const [key, value] of Object.entries(environment.environmentVariables)) {
      newEnvironment.environmentVariables.set(key, value);
    }

    return newEnvironment;
  }
}
