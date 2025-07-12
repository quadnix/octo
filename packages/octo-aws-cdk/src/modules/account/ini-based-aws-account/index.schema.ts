import { type App, AppSchema, Schema, Validate } from '@quadnix/octo';

/**
 * `AwsIniAccountModuleSchema` is the input schema for the `AwsIniAccountModule` module.
 * This schema defines the required and optional inputs for setting up an INI-based AWS account
 * using AWS credential profiles from configuration files.
 *
 * @group Modules/Account/IniBasedAwsAccount
 *
 * @hideconstructor
 *
 * @see {@link AwsIniAccountModule} to learn more about the `AwsIniAccountModule` module.
 */
export class AwsIniAccountModuleSchema {
  /**
   * The AWS account ID that the INI profile belongs to.
   * This is validated against the actual account ID returned by AWS STS to ensure profile validity.
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
   * The name of the AWS credential profile to use from the INI files.
   * This profile should be configured in ~/.aws/credentials or ~/.aws/config.
   * Defaults to 'default' if not specified.
   */
  @Validate({ options: { minLength: 1 } })
  iniProfile? = Schema<string>('default');
}
