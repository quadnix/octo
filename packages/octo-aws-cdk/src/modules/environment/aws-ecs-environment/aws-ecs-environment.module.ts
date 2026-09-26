import { AModule, type Account, type Environment, Module } from '@quadnix/octo';
import { AwsEcsClusterAnchor } from '../../../anchors/aws-ecs/aws-ecs-cluster.anchor.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsEcsEnvironmentModuleSchema } from './index.schema.js';
import { AwsEcsEnvironment } from './models/environment/index.js';

/**
 * `AwsEcsEnvironmentModule` is an ECS-based AWS environment module
 * that provides an implementation for the `Environment` model.
 * This module creates environments within AWS regions, establishing ECS clusters and managing environment variables.
 * It serves as the foundation for deploying containerized applications in specific environments.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Region, stub } from '@quadnix/octo';
 * import { AwsEcsEnvironmentModule } from '@quadnix/octo-aws-cdk/modules/environment/aws-ecs-environment';
 *
 * octo.loadModule(AwsEcsEnvironmentModule, 'my-environment-module', {
 *   environmentName: 'production',
 *   environmentVariables: {
 *     NODE_ENV: 'production',
 *     API_URL: 'https://api.example.com'
 *   },
 *   region: stub<Region>('${{my-region-module.model.region}}'),
 * });
 * ```
 *
 * @group Modules/Environment/AwsEcsEnvironment
 *
 * @reference Resources {@link EcsClusterSchema}
 *
 * @see {@link AwsEcsEnvironmentModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Environment](/api/octo/class/Environment) to learn more about the `Environment` model.
 */
@Module<AwsEcsEnvironmentModule>('@octo', AwsEcsEnvironmentModuleSchema)
export class AwsEcsEnvironmentModule extends AModule<AwsEcsEnvironmentModuleSchema, Environment> {
  /**
   * Creates the environment and its environment variables, and anchors the ECS cluster it maps to.
   */
  async onInit(inputs: AwsEcsEnvironmentModuleSchema): Promise<AwsEcsEnvironment> {
    const region = inputs.region;
    const { clusterName } = await this.registerMetadata(inputs);

    // Create a new environment.
    const environment = new AwsEcsEnvironment(inputs.environmentName);
    for (const [key, value] of Object.entries(inputs.environmentVariables || {})) {
      environment.environmentVariables.set(key, value);
    }
    region.addEnvironment(environment);

    // Add anchors.
    environment.addAnchor(
      new AwsEcsClusterAnchor(
        'AwsEcsClusterAnchor',
        {
          clusterName,
          environmentVariables: Object.fromEntries(environment.environmentVariables.entries()),
        },
        environment,
      ),
    );

    return environment;
  }

  /**
   * Resolves the account, region, and the name of the ECS cluster this environment's executions run on.
   */
  override async registerMetadata(inputs: AwsEcsEnvironmentModuleSchema): Promise<{
    awsAccountId: string;
    awsRegionId: string;
    clusterName: string;
  }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      awsAccountId: account.accountId,
      awsRegionId,
      clusterName: [region.regionId, inputs.environmentName].join('-'),
    };
  }
}
