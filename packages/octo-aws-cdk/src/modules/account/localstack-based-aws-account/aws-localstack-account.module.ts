import { S3Client } from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AModule, Container, Module } from '@quadnix/octo';
import type { STSClientFactory } from '../../../factories/aws-client.factory.js';
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
 * import { AwsLocalstackAccountModule } from '@quadnix/octo-aws-cdk/modules/account/localstack-based-aws-account';
 *
 * octo.loadModule(AwsLocalstackAccountModule, 'my-account-module', {
 *   app: myApp,
 *   endpoint: 'http://localhost:4566',
 *   endpointS3: 'http://s3.localhost.localstack.cloud:4566'
 * });
 * ```
 *
 * @group Modules/Account/LocalstackBasedAwsAccount
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
      throw new Error(`Localstack Account ID "${accountId}" does not match "${data.Account}"!`);
    }

    return account;
  }
}
