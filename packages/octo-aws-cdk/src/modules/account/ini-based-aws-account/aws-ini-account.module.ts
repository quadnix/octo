import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AModule, Container, Module } from '@quadnix/octo';
import type { STSClientFactory } from '../../../factories/aws-client.factory.js';
import { AwsIniAccountModuleSchema } from './index.schema.js';
import { AwsIniAccount } from './models/account/index.js';

@Module<AwsIniAccountModule>('@octo', AwsIniAccountModuleSchema)
export class AwsIniAccountModule extends AModule<AwsIniAccountModuleSchema, AwsIniAccount> {
  async onInit(inputs: AwsIniAccountModuleSchema): Promise<AwsIniAccount> {
    const app = inputs.app;
    const container = Container.getInstance();

    // Create a new account.
    const account = new AwsIniAccount(inputs.accountId, inputs.iniProfile!);
    app.addAccount(account);

    // Register AWS credentials.
    const credentials = account.getCredentials();
    container.registerValue('AwsCredentialIdentityProvider', credentials, {
      metadata: { awsAccountId: inputs.accountId, package: '@octo' },
    });

    // Ensure profile is valid, and the account ID matches.
    const stsClient = await container.get<STSClient, typeof STSClientFactory>(STSClient, {
      args: [inputs.accountId],
      metadata: { package: '@octo' },
    });
    const data = await stsClient.send(new GetCallerIdentityCommand({}));
    if (data.Account !== inputs.accountId) {
      throw new Error(`Account ID "${inputs.accountId}" does not belong to profile "${inputs.iniProfile}"!`);
    }

    return account;
  }
}
