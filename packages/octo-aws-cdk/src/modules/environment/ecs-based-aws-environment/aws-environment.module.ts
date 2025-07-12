import { AModule, type Account, type Environment, Module } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EcsClusterAnchor } from '../../../anchors/ecs-cluster/ecs-cluster.anchor.js';
import { AwsEnvironmentModuleSchema } from './index.schema.js';
import { AwsEnvironment } from './models/environment/index.js';

/**
 * `AwsEnvironmentModule` is an ECS-based AWS environment module
 * that provides an implementation for the `Environment` model.
 * This module creates environments within AWS regions, establishing ECS clusters and managing environment variables.
 * It serves as the foundation for deploying containerized applications in specific environments.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsEnvironmentModule } from '@quadnix/octo-aws-cdk/modules/environment/ecs-based-aws-environment';
 *
 * octo.loadModule(AwsEnvironmentModule, 'my-environment-module', {
 *   environmentName: 'production',
 *   environmentVariables: {
 *     NODE_ENV: 'production',
 *     API_URL: 'https://api.example.com'
 *   },
 *   region: myRegion,
 * });
 * ```
 *
 * @group Modules/Environment/EcsBasedAwsEnvironment
 *
 * @reference Resources {@link EcsClusterSchema}
 *
 * @see {@link AwsEnvironmentModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Environment} to learn more about the `Environment` model.
 */
@Module<AwsEnvironmentModule>('@octo', AwsEnvironmentModuleSchema)
export class AwsEnvironmentModule extends AModule<AwsEnvironmentModuleSchema, Environment> {
  async onInit(inputs: AwsEnvironmentModuleSchema): Promise<AwsEnvironment> {
    const region = inputs.region;
    const { clusterName } = await this.registerMetadata(inputs);

    // Create a new environment.
    const environment = new AwsEnvironment(inputs.environmentName);
    for (const [key, value] of Object.entries(inputs.environmentVariables || {})) {
      environment.environmentVariables.set(key, value);
    }
    region.addEnvironment(environment);

    // Add anchors.
    const clusterAnchor = new EcsClusterAnchor(
      'EcsClusterAnchor',
      {
        clusterName,
        environmentVariables: Object.fromEntries(environment.environmentVariables.entries()),
      },
      environment,
    );
    environment.addAnchor(clusterAnchor);

    return environment;
  }

  override async registerMetadata(inputs: AwsEnvironmentModuleSchema): Promise<{
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
