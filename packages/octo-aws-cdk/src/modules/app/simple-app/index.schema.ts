import { Schema, Validate } from '@quadnix/octo';

/**
 * `SimpleAppModuleSchema` is the input schema for the `SimpleAppModule` module.
 *
 * @group Modules/App/SimpleApp
 *
 * @hideconstructor
 *
 * @see {@link SimpleAppModule} to learn more about the `SimpleAppModule` module.
 */
export class SimpleAppModuleSchema {
  /**
   * When naming the app, it is essential to consider the project for which you are developing the infrastructure.
   * If the project encompasses multiple services, such as in a monorepo setup,
   * you will need to determine whether to implement a unified infrastructure for all services or to establish
   * separate infrastructures for each one. The chosen approach will typically influence the app's name,
   * reflecting the structure and organization of the project.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();
}
