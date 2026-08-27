import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AModule, Container, Module, ModuleError } from '@quadnix/octo';
import { AwsAccountAnchor } from '../../../anchors/aws-account/aws-account.anchor.js';
import { STSClientFactory } from '../../../factories/aws-client.factory.js';
import { AwsIniAccountModuleSchema } from './index.schema.js';
import { AwsIniAccount } from './models/account/index.js';

/**
 * `AwsIniAccountModule` is an INI-based AWS account module that provides an implementation for the `Account` model.
 * This module allows you to configure AWS account access using AWS credential profiles from INI files
 * (typically ~/.aws/credentials or ~/.aws/config). It's useful for development environments where
 * credentials are managed through AWS CLI or SDK configuration files.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-ini-account';
 *
 * octo.loadModule(AwsIniAccountModule, 'my-account-module', {
 *   accountId: '123456789012',
 *   app: myApp,
 *   iniProfile: 'development' // Optional, defaults to 'default'
 * });
 * ```
 *
 * @group Modules/Account/AwsIniAccount
 *
 * @see {@link AwsIniAccountModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Account](/api/octo/class/Account) to learn more about the `Account` model.
 */
@Module<AwsIniAccountModule>('@octo', AwsIniAccountModuleSchema)
export class AwsIniAccountModule extends AModule<AwsIniAccountModuleSchema, AwsIniAccount> {
  /**
   * Creates the account from the named AWS CLI profile, and anchors it for other modules to find.
   */
  async onInit(inputs: AwsIniAccountModuleSchema): Promise<AwsIniAccount> {
    const app = inputs.app;
    const container = Container.getInstance();

    // Create a new account.
    const account = new AwsIniAccount(inputs.accountId, inputs.iniProfile!);
    app.addAccount(account);

    // Add anchors.
    account.addAnchor(new AwsAccountAnchor('AwsAccountAnchor', { awsAccountId: inputs.accountId }, account));

    // Register AWS credentials, and any endpoint overrides, against the account they belong to.
    const metadata = { awsAccountId: inputs.accountId, package: '@octo' };
    container.replaceValue('AwsCredentialIdentityProvider', account.getCredentials(), { metadata });
    if (Object.keys(inputs.endpoints!).length > 0) {
      container.replaceValue('AwsServiceEndpoints', inputs.endpoints!, { metadata });
    }

    // Ensure the credentials are valid, and that they belong to the account they were given for.
    const stsClient = await container.get<STSClient, typeof STSClientFactory>(STSClient, {
      args: [inputs.accountId],
      metadata: { package: '@octo' },
    });
    const callerIdentity = await stsClient.send(new GetCallerIdentityCommand({}));
    if (callerIdentity.Account !== inputs.accountId) {
      throw new ModuleError(`Account ID "${inputs.accountId}" does not belong to profile "${inputs.iniProfile}"!`, this.constructor.name);
    }

    return account;
  }
}
