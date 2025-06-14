import { type App, AppSchema, Schema, Validate } from '@quadnix/octo';

export class AwsAccountModuleSchema {
  @Validate({ options: { minLength: 1 } })
  accountId = Schema<string>();

  @Validate({ options: { isSchema: { schema: AppSchema } } })
  app = Schema<App>();

  @Validate({ options: { minLength: 1 } })
  iniProfile? = Schema<string>('default');
}
