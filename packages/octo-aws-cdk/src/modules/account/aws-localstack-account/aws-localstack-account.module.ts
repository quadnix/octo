import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AModule, Container, Module, ModuleError } from '@quadnix/octo';
import { AwsAccountAnchor } from '../../../anchors/aws-account/aws-account.anchor.js';
import { STSClientFactory } from '../../../factories/aws-client.factory.js';
import { AwsLocalstackAccountModuleSchema } from './index.schema.js';
import { AwsLocalstackAccount } from './models/account/index.js';

/**
 * `AwsLocalstackAccountModule` is a LocalStack-based AWS account module
 * that provides an implementation for the `Account` model.
 * This module is specifically designed for testing and development environments using LocalStack,
 * creating an AWS account with predefined credentials and endpoints for local development.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsLocalstackAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-localstack-account';
 *
 * octo.loadModule(AwsLocalstackAccountModule, 'my-account-module', {
 *   app: myApp,
 *   endpoint: 'http://localhost:4566',
 *   endpointS3: 'http://s3.localhost.localstack.cloud:4566'
 * });
 * ```
 *
 * @group Modules/Account/AwsLocalstackAccount
 *
 * @see {@link AwsLocalstackAccountModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Account} to learn more about the `Account` model.
 */
@Module<AwsLocalstackAccountModule>('@octo', AwsLocalstackAccountModuleSchema)
export class AwsLocalstackAccountModule extends AModule<AwsLocalstackAccountModuleSchema, AwsLocalstackAccount> {
  async onInit(inputs: AwsLocalstackAccountModuleSchema): Promise<AwsLocalstackAccount> {
    const app = inputs.app;
    const container = Container.getInstance();

    // Create a new account.
    const accountId: string = '000000000000';
    const account = new AwsLocalstackAccount(accountId);
    app.addAccount(account);

    // Add anchors.
    account.addAnchor(new AwsAccountAnchor('AwsAccountAnchor', { awsAccountId: accountId }, account));

    // Register AWS credentials.
    const credentials = account.getCredentials();
    container.registerValue('AwsCredentialIdentityProvider', credentials, {
      metadata: { awsAccountId: accountId, package: '@octo' },
    });

    // Ensure credentials are valid, and the account ID matches.
    const stsClient = await container.get<STSClient, typeof STSClientFactory>(STSClient, {
      args: [accountId],
      metadata: { package: '@octo' },
    });
    const data = await stsClient.send(new GetCallerIdentityCommand({}));
    if (data.Account !== accountId) {
      throw new ModuleError(
        `Localstack Account ID "${accountId}" does not match "${data.Account}"!`,
        this.constructor.name,
      );
    }

    return account;
  }
}
