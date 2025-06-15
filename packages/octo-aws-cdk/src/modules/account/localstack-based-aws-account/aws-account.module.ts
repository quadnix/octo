import { S3Client } from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AModule, Container, Module } from '@quadnix/octo';
import type { STSClientFactory } from '../../../factories/aws-client.factory.js';
import { AwsAccountModuleSchema } from './index.schema.js';
import { AwsAccount } from './models/account/index.js';

@Module<AwsAccountModule>('@octo', AwsAccountModuleSchema)
export class AwsAccountModule extends AModule<AwsAccountModuleSchema, AwsAccount> {
  async onInit(inputs: AwsAccountModuleSchema): Promise<AwsAccount> {
    const app = inputs.app;
    const container = Container.getInstance();

    // Create a new account.
    const accountId: string = '000000000000';
    const account = new AwsAccount(accountId);
    app.addAccount(account);

    // Register AWS credentials.
    const credentials = account.getCredentials();
    container.registerValue('AwsCredentialIdentityProvider', credentials, {
      metadata: { awsAccountId: accountId, package: '@octo' },
    });

    // Register Endpoint.
    container.registerValue(
      'EndpointInputConfig',
      { endpoint: inputs.endpoint! },
      {
        metadata: { awsAccountId: accountId, package: '@octo' },
      },
    );

    // Re-register S3Client Factory.
    if (container.has(S3Client, { metadata: { package: '@octo' } })) {
      container.unRegisterFactory(S3Client, { metadata: { package: '@octo' } });

      container.registerFactory(
        S3Client,
        class {
          static async create(_awsAccountId: string, awsRegionId: string): Promise<S3Client> {
            return new S3Client({
              ...credentials,
              endpoint: inputs.endpointS3,
              region: awsRegionId,
            });
          }
        },
        { metadata: { package: '@octo' } },
      );
    }

    // Ensure credentials are valid, and the account ID matches.
    const stsClient = await container.get<STSClient, typeof STSClientFactory>(STSClient, {
      args: [accountId],
      metadata: { package: '@octo' },
    });
    const data = await stsClient.send(new GetCallerIdentityCommand({}));
    if (data.Account !== accountId) {
      throw new Error(`LocalStack Account ID must be "${accountId}"!`);
    }

    return account;
  }
}
