import { ECSClient } from '@aws-sdk/client-ecs';
import { AModule, type Account, Container, ContainerRegistrationError, Module } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { EcsClusterAnchor } from '../../../anchors/ecs-cluster/ecs-cluster.anchor.js';
import { AwsEnvironmentModuleSchema } from './index.schema.js';
import { AwsEnvironment } from './models/environment/index.js';

@Module<AwsEnvironmentModule>('@octo', AwsEnvironmentModuleSchema)
export class AwsEnvironmentModule extends AModule<AwsEnvironmentModuleSchema, AwsEnvironment> {
  private context: { clusterName: string } = {} as { clusterName: string };

  async onInit(inputs: AwsEnvironmentModuleSchema): Promise<AwsEnvironment> {
    const region = inputs.region;
    const { account, awsAccountId, awsRegionId } = await this.registerMetadata(inputs);

    // Create a new environment.
    const environment = new AwsEnvironment(inputs.environmentName);
    for (const [key, value] of Object.entries(inputs.environmentVariables || {})) {
      environment.environmentVariables.set(key, value);
    }
    region.addEnvironment(environment);

    this.context.clusterName = [region.regionId, environment.environmentName].join('-');

    // Add anchors.
    const clusterAnchor = new EcsClusterAnchor(
      'EcsClusterAnchor',
      {
        clusterName: this.context.clusterName,
        environmentVariables: Object.fromEntries(environment.environmentVariables.entries()),
      },
      environment,
    );
    environment.addAnchor(clusterAnchor);

    // Create and register a new ECSClient.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const ecsClient = new ECSClient({ ...credentials, region: awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(ECSClient, ecsClient, {
        metadata: { awsAccountId, awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return environment;
  }

  override async registerMetadata(inputs: AwsEnvironmentModuleSchema): Promise<{
    account: Account;
    awsAccountId: string;
    awsRegionId: string;
    context: AwsEnvironmentModule['context'];
  }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      account,
      awsAccountId: account.accountId,
      awsRegionId,
      context: this.context,
    };
  }
}
