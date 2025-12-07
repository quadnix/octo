import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AModule, Container, Module } from '@quadnix/octo';
import { AwsAccountAnchor } from '../../../anchors/aws-account/aws-account.anchor.js';
import { STSClientFactory } from '../../../factories/aws-client.factory.js';
import { AwsMotoAccountModuleSchema } from './index.schema.js';
import { AwsMotoAccount } from './models/account/index.js';

/**
 * `AwsMotoAccountModule` is a Moto-based AWS account module that provides an implementation for the `Account` model.
 * This module is specifically designed for testing environments using the Moto library,
 * creating an AWS account with mock credentials and endpoints for unit testing.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsMotoAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-moto-account';
 *
 * octo.loadModule(AwsMotoAccountModule, 'my-account-module', {
 *   app: myApp,
 *   endpoint: 'http://localhost:5000'
 * });
 * ```
 *
 * @group Modules/Account/AwsMotoAccount
 *
 * @see {@link AwsMotoAccountModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Account} to learn more about the `Account` model.
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

    // Add anchors.
    account.addAnchor(new AwsAccountAnchor('AwsAccountAnchor', { awsAccountId: accountId }, account));

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
