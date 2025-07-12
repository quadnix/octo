import { type App, AppSchema, Schema, Validate } from '@quadnix/octo';

/**
 * `AwsLocalstackAccountModuleSchema` is the input schema for the `AwsLocalstackAccountModule` module.
 * This schema defines the required and optional inputs for setting up a LocalStack-based AWS account
 * for testing and development purposes.
 *
 * @group Modules/Account/LocalstackBasedAwsAccount
 *
 * @hideconstructor
 *
 * @see {@link AwsLocalstackAccountModule} to learn more about the `AwsLocalstackAccountModule` module.
 */
export class AwsLocalstackAccountModuleSchema {
  /**
   * The `App` instance that this account will be associated with.
   * This establishes the parent-child relationship between the app and the account.
   */
  @Validate({ options: { isSchema: { schema: AppSchema } } })
  app = Schema<App>();

  /**
   * The primary endpoint URL for LocalStack services.
   * This is used for most AWS services when communicating with LocalStack.
   * Defaults to the standard LocalStack endpoint.
   */
  @Validate({
    destruct: (value: AwsLocalstackAccountModuleSchema['endpoint']): string[] => [value!],
    options: { minLength: 1 },
  })
  endpoint? = Schema<string>('http://localhost:4566');

  /**
   * The specific endpoint URL for S3 services in LocalStack.
   * This allows for separate configuration of S3 endpoints when needed.
   * Defaults to the LocalStack S3 endpoint with domain-style bucket access.
   */
  @Validate({
    destruct: (value: AwsLocalstackAccountModuleSchema['endpointS3']): string[] => [value!],
    options: { minLength: 1 },
  })
  endpointS3? = Schema<string>('http://s3.localhost.localstack.cloud:4566');
}
