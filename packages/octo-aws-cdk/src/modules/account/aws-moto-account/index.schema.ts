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
   * The endpoint URL for Moto server services.
   * This is used for AWS services when communicating with Moto mock server.
   * Defaults to the standard Moto server endpoint.
   */
  @Validate({
    destruct: (value: AwsMotoAccountModuleSchema['endpoint']): string[] => [value!],
    options: { minLength: 1 },
  })
  endpoint? = Schema<string>('http://localhost:5000');
}
