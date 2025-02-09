import { AModule, type Account, Module } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EcsClusterAnchor } from '../../../anchors/ecs-cluster/ecs-cluster.anchor.js';
import { AwsEnvironmentModuleSchema } from './index.schema.js';
import { AwsEnvironment } from './models/environment/index.js';

@Module<AwsEnvironmentModule>('@octo', AwsEnvironmentModuleSchema)
export class AwsEnvironmentModule extends AModule<AwsEnvironmentModuleSchema, AwsEnvironment> {
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
