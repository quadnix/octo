import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AModule, Container, Module, ModuleError } from '@quadnix/octo';
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
 *   endpoints: { s3: 'http://localhost:5000', sts: 'http://localhost:5000' },
 * });
 * ```
 *
 * @group Modules/Account/AwsMotoAccount
 *
 * @see {@link AwsMotoAccountModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Account](/api/octo/class/Account) to learn more about the `Account` model.
 */
@Module<AwsMotoAccountModule>('@octo', AwsMotoAccountModuleSchema)
export class AwsMotoAccountModule extends AModule<AwsMotoAccountModuleSchema, AwsMotoAccount> {
  /**
   * Creates the Moto account under a fixed account ID, and anchors it for other modules to find.
   */
  async onInit(inputs: AwsMotoAccountModuleSchema): Promise<AwsMotoAccount> {
    const app = inputs.app;
    const container = Container.getInstance();

    // Create a new account.
    const accountId: string = '123456789012';
    const account = new AwsMotoAccount(accountId);
    app.addAccount(account);

    // Add anchors.
    account.addAnchor(new AwsAccountAnchor('AwsAccountAnchor', { awsAccountId: accountId }, account));

    // Register AWS credentials, and any endpoint overrides, against the account they belong to.
    const metadata = { awsAccountId: accountId, package: '@octo' };
    container.replaceValue('AwsCredentialIdentityProvider', account.getCredentials(), { metadata });
    if (Object.keys(inputs.endpoints!).length > 0) {
      container.replaceValue('AwsServiceEndpoints', inputs.endpoints!, { metadata });
    }

    // Ensure the credentials are valid, and that they belong to the account they were given for.
    const stsClient = await container.get<STSClient, typeof STSClientFactory>(STSClient, {
      args: [accountId],
      metadata: { package: '@octo' },
    });
    const callerIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
    if (callerIdentity.Account !== accountId) {
      throw new ModuleError(`Moto Account ID "${accountId}" does not match "${callerIdentity.Account}"!`, this.constructor.name);
    }

    return account;
  }
}
