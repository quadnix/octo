import { type App, AppSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @group Modules/Account/MotoBasedAwsAccount
 *
 * @hideconstructor
 */
export class AwsMotoAccountModuleSchema {
  @Validate({ options: { isSchema: { schema: AppSchema } } })
  app = Schema<App>();

  @Validate({
    destruct: (value: AwsMotoAccountModuleSchema['endpoint']): string[] => [value!],
    options: { minLength: 1 },
  })
  endpoint? = Schema<string>('http://localhost:5000');
}
