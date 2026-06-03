import { type App, AppSchema, Schema, Validate } from '@quadnix/octo';

/**
 * `AwsLocalstackAccountModuleSchema` is the input schema for the `AwsLocalstackAccountModule` module.
 * This schema defines the required and optional inputs for setting up a LocalStack-based AWS account
 * for testing and development purposes.
 *
 * @group Modules/Account/AwsLocalstackAccount
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
   * A map of AWS service name to endpoint URL for LocalStack services.
   * Keys are Terraform AWS provider service names (e.g. `s3`, `ec2`, `sts`).
   */
  @Validate({
    destruct: (value: AwsLocalstackAccountModuleSchema['endpoints']): string[] => Object.values(value!),
    options: { minLength: 1 },
  })
  endpoints? = Schema<Record<string, string>>({});
}
