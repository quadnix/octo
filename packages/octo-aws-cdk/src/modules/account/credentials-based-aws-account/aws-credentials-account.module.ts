import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AModule, Container, Module } from '@quadnix/octo';
import type { STSClientFactory } from '../../../factories/aws-client.factory.js';
import { AwsCredentialsAccountModuleSchema } from './index.schema.js';
import { AwsCredentialsAccount } from './models/account/index.js';

@Module<AwsCredentialsAccountModule>('@octo', AwsCredentialsAccountModuleSchema)
export class AwsCredentialsAccountModule extends AModule<AwsCredentialsAccountModuleSchema, AwsCredentialsAccount> {
  async onInit(inputs: AwsCredentialsAccountModuleSchema): Promise<AwsCredentialsAccount> {
    const app = inputs.app;
    const container = Container.getInstance();

    // Create a new account.
    const account = new AwsCredentialsAccount(inputs.accountId, inputs.credentials);
    app.addAccount(account);

    // Register AWS credentials.
    const credentials = account.getCredentials();
    container.registerValue('AwsCredentialIdentityProvider', credentials, {
      metadata: { awsAccountId: inputs.accountId, package: '@octo' },
    });

    // Register Endpoint.
    if (inputs.endpoint) {
      container.registerValue(
        'EndpointInputConfig',
        { endpoint: inputs.endpoint },
        {
          metadata: { awsAccountId: inputs.accountId, package: '@octo' },
        },
      );
    }

    // Ensure credentials are valid, and the account ID matches.
    const stsClient = await container.get<STSClient, typeof STSClientFactory>(STSClient, {
      args: [inputs.accountId],
      metadata: { package: '@octo' },
    });
    const data = await stsClient.send(new GetCallerIdentityCommand({}));
    if (data.Account !== inputs.accountId) {
      throw new Error(`Account ID "${inputs.accountId}" does not belong to given credentials!`);
    }

    return account;
  }
}
