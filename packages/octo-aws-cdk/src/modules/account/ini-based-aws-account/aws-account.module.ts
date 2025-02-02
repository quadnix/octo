import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AModule, Container, ContainerRegistrationError, Module } from '@quadnix/octo';
import { AwsAccountModuleSchema } from './index.schema.js';
import { AwsAccount } from './models/account/index.js';

@Module<AwsAccountModule>('@octo', AwsAccountModuleSchema)
export class AwsAccountModule extends AModule<AwsAccountModuleSchema, AwsAccount> {
  async onInit(inputs: AwsAccountModuleSchema): Promise<AwsAccount> {
    const app = inputs.app;

    // Create a new account.
    const account = new AwsAccount(inputs.accountId, inputs.iniProfile!);
    app.addAccount(account);

    // Create and register a new STSClient.
    const credentials = account.getCredentials();
    const container = Container.getInstance();
    try {
      container.registerValue(STSClient, new STSClient({ ...credentials }), {
        metadata: { awsAccountId: inputs.accountId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    // Ensure profile is valid, and the account ID matches.
    const stsClient = await container.get(STSClient, {
      metadata: { awsAccountId: inputs.accountId, package: '@octo' },
    });
    const data = await stsClient.send(new GetCallerIdentityCommand({}));
    if (data.Account !== inputs.accountId) {
      throw new Error(`Account ID "${inputs.accountId}" does not belong to profile "${inputs.iniProfile}"!`);
    }

    return account;
  }
}
