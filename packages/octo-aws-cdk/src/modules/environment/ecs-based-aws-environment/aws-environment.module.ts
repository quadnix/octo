import { ECSClient } from '@aws-sdk/client-ecs';
import {
  AModule,
  type Account,
  BaseResourceSchema,
  Container,
  ContainerRegistrationError,
  Module,
  type Region,
  Schema,
  Validate,
} from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsEnvironment } from './models/environment/index.js';

export class AwsResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.awsRegionId], options: { minLength: 1 } })
  override properties = Schema<{
    awsRegionId: string;
  }>();
}

export class AwsEnvironmentModuleSchema {
  environmentName = Schema<string>();

  environmentVariables? = Schema<Record<string, string>>({});

  region = Schema<Region>();
}

@Module<AwsEnvironmentModule>('@octo', AwsEnvironmentModuleSchema)
export class AwsEnvironmentModule extends AModule<AwsEnvironmentModuleSchema, AwsEnvironment> {
  async onInit(inputs: AwsEnvironmentModuleSchema): Promise<AwsEnvironment> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [resourceSynth] = (await region.getResourceMatchingSchema(AwsResourceSchema))!;
    const awsRegionId = resourceSynth.properties.awsRegionId;

    // Create a new environment.
    const environment = new AwsEnvironment(inputs.environmentName);
    for (const [key, value] of Object.entries(inputs.environmentVariables || {})) {
      environment.environmentVariables.set(key, value);
    }
    region.addEnvironment(environment);

    // Create and register a new ECSClient.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const ecsClient = new ECSClient({ ...credentials, region: awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(ECSClient, ecsClient, {
        metadata: { awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return environment;
  }
}
