import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AModule, Container, Module } from '@quadnix/octo';
import type { STSClientFactory } from '../../../factories/aws-client.factory.js';
import { AwsMotoAccountModuleSchema } from './index.schema.js';
import { AwsMotoAccount } from './models/account/index.js';

/**
 * @group Modules/Account/MotoBasedAwsAccount
 */
@Module<AwsMotoAccountModule>('@octo', AwsMotoAccountModuleSchema)
export class AwsMotoAccountModule extends AModule<AwsMotoAccountModuleSchema, AwsMotoAccount> {
  async onInit(inputs: AwsMotoAccountModuleSchema): Promise<AwsMotoAccount> {
    const app = inputs.app;
    const container = Container.getInstance();

    // Create a new account.
    const accountId: string = '123456789012';
    const account = new AwsMotoAccount(accountId);
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

    // Ensure credentials are valid, and the account ID matches.
    const stsClient = await container.get<STSClient, typeof STSClientFactory>(STSClient, {
      args: [accountId],
      metadata: { package: '@octo' },
    });
    const data = await stsClient.send(new GetCallerIdentityCommand({}));
    if (data.Account !== accountId) {
      throw new Error(`Moto Account ID "${accountId}" does not match "${data.Account}"!`);
    }

    return account;
  }
}
