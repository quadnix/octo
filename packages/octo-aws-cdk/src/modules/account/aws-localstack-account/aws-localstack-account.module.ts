import { AModule, Container, Module } from '@quadnix/octo';
import { AwsAccountAnchor } from '../../../anchors/aws-account/aws-account.anchor.js';
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
 * import { type App, stub } from '@quadnix/octo';
 * import { AwsLocalstackAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-localstack-account';
 *
 * octo.loadModule(AwsLocalstackAccountModule, 'my-account-module', {
 *   app: stub<App>('${{my-app-module.model.app}}'),
 *   endpoints: { s3: 'http://localhost:4566', sts: 'http://localhost:4566' },
 * });
 * ```
 *
 * @group Modules/Account/AwsLocalstackAccount
 *
 * @see {@link AwsLocalstackAccountModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Account](/api/octo/class/Account) to learn more about the `Account` model.
 */
@Module<AwsLocalstackAccountModule>('@octo', AwsLocalstackAccountModuleSchema)
export class AwsLocalstackAccountModule extends AModule<AwsLocalstackAccountModuleSchema, AwsLocalstackAccount> {
  /**
   * Creates the LocalStack account under a fixed account ID, and anchors it for other modules to find.
   */
  async onInit(inputs: AwsLocalstackAccountModuleSchema): Promise<AwsLocalstackAccount> {
    const app = inputs.app;
    const container = Container.getInstance();

    // Create a new account.
    const accountId: string = '000000000000';
    const account = new AwsLocalstackAccount(accountId);
    app.addAccount(account);

    // Add anchors.
    account.addAnchor(new AwsAccountAnchor('AwsAccountAnchor', { awsAccountId: accountId }, account));

    // Register AWS credentials, and any endpoint overrides, against the account they belong to.
    const metadata = { awsAccountId: accountId, package: '@octo' };
    container.replaceValue('AwsCredentialIdentityProvider', account.getCredentials(), { metadata });
    if (Object.keys(inputs.endpoints!).length > 0) {
      container.replaceValue('AwsServiceEndpoints', inputs.endpoints!, { metadata });
    }

    return account;
  }
}
