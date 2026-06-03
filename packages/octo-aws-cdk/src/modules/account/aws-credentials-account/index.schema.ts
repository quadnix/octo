import { type App, AppSchema, Schema, Validate } from '@quadnix/octo';

/**
 * `AwsCredentialsAccountModuleSchema` is the input schema for the `AwsCredentialsAccountModule` module.
 * This schema defines the required and optional inputs for setting up a credentials-based AWS account
 * using explicit AWS credentials for authentication.
 *
 * @group Modules/Account/AwsCredentialsAccount
 *
 * @hideconstructor
 *
 * @see {@link AwsCredentialsAccountModule} to learn more about the `AwsCredentialsAccountModule` module.
 */
export class AwsCredentialsAccountModuleSchema {
  /**
   * The AWS account ID that these credentials belong to.
   * This is validated against the actual account ID returned by AWS STS to ensure credential validity.
   */
  @Validate({ options: { minLength: 1 } })
  accountId = Schema<string>();

  /**
   * The `App` instance that this account will be associated with.
   * This establishes the parent-child relationship between the app and the account.
   */
  @Validate({ options: { isSchema: { schema: AppSchema } } })
  app = Schema<App>();

  /**
   * The AWS credentials object containing the access key ID and secret access key.
   * These credentials are used for authenticating with AWS services.
   * Both accessKeyId and secretAccessKey are required and must be valid AWS credentials.
   */
  @Validate({
    destruct: (value: AwsCredentialsAccountModuleSchema['credentials']): string[] => [
      value.accessKeyId,
      value.secretAccessKey,
    ],
    options: { minLength: 1 },
  })
  credentials = Schema<{ accessKeyId: string; secretAccessKey: string }>();

  /**
   * A map of AWS service name to endpoint URL.
   * Keys are Terraform AWS provider service names (e.g. `s3`, `ec2`, `sts`).
   */
  @Validate({
    destruct: (value: AwsCredentialsAccountModuleSchema['endpoints']): string[] => Object.values(value!),
    options: { minLength: 1 },
  })
  endpoints? = Schema<Record<string, string>>({});
}
