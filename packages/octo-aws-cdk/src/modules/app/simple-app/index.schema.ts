import { Schema, Validate } from '@quadnix/octo';

export class AppModuleSchema {
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();
}
