import { type App, AppSchema, Schema, Validate } from '@quadnix/octo';

/**
 * `AwsMotoAccountModuleSchema` is the input schema for the `AwsMotoAccountModule` module.
 * This schema defines the required and optional inputs for setting up a Moto-based AWS account
 * for unit testing purposes.
 *
 * @group Modules/Account/AwsMotoAccount
 *
 * @hideconstructor
 *
 * @see {@link AwsMotoAccountModule} to learn more about the `AwsMotoAccountModule` module.
 */
export class AwsMotoAccountModuleSchema {
  /**
   * The `App` instance that this account will be associated with.
   * This establishes the parent-child relationship between the app and the account.
   */
  @Validate({ options: { isSchema: { schema: AppSchema } } })
  app = Schema<App>();

  /**
   * A map of AWS service name to endpoint URL for Moto server services.
   * Keys are Terraform AWS provider service names (e.g. `s3`, `ec2`, `sts`).
   */
  @Validate({
    destruct: (value: AwsMotoAccountModuleSchema['endpoints']): string[] => Object.values(value!),
    options: { minLength: 1 },
  })
  endpoints? = Schema<Record<string, string>>({});
}
