import { AModule, Module } from '@quadnix/octo';
import { AwsServerlessEnvironmentAnchor } from '../../../anchors/aws-environment/aws-serverless-environment.anchor.js';
import { AwsServerlessEnvironmentModuleSchema } from './index.schema.js';
import { AwsServerlessEnvironment } from './models/environment/index.js';

/**
 * `AwsServerlessEnvironmentModule` is an AWS environment module that provides an implementation for the
 * `Environment` model, for serverless regions. It creates nothing: an environment in a serverless region
 * has no cluster to run on. It carries the environment variables every execution in it gets.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Region, stub } from '@quadnix/octo';
 * import { AwsServerlessEnvironmentModule } from '@quadnix/octo-aws-cdk/modules/environment/aws-serverless-environment';
 *
 * octo.loadModule(AwsServerlessEnvironmentModule, 'my-environment-module', {
 *   environmentName: 'qa',
 *   environmentVariables: { NODE_ENV: 'qa' },
 *   region: stub<Region>('${{my-region-module.model.region}}'),
 * });
 * ```
 *
 * @group Modules/Environment/AwsServerlessEnvironment
 *
 * @see {@link AwsServerlessEnvironmentModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Environment](/api/octo/class/Environment) to learn more about the `Environment` model.
 */
@Module<AwsServerlessEnvironmentModule>('@octo', AwsServerlessEnvironmentModuleSchema)
export class AwsServerlessEnvironmentModule extends AModule<
  AwsServerlessEnvironmentModuleSchema,
  AwsServerlessEnvironment
> {
  /**
   * Creates the environment and its environment variables under the region, and anchors them.
   */
  async onInit(inputs: AwsServerlessEnvironmentModuleSchema): Promise<AwsServerlessEnvironment> {
    const region = inputs.region;

    // Create a new environment.
    const environment = new AwsServerlessEnvironment(inputs.environmentName);
    for (const [key, value] of Object.entries(inputs.environmentVariables || {})) {
      environment.environmentVariables.set(key, value);
    }
    region.addEnvironment(environment);

    // Add anchors.
    environment.addAnchor(
      new AwsServerlessEnvironmentAnchor(
        'AwsServerlessEnvironmentAnchor',
        {
          environmentName: environment.environmentName,
          environmentVariables: Object.fromEntries(environment.environmentVariables.entries()),
          serverless: true,
        },
        environment,
      ),
    );

    return environment;
  }
}
