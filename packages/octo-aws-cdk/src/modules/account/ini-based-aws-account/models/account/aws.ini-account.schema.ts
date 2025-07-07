import { AccountSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsIniAccountSchema extends AccountSchema {
  @Validate({ options: { minLength: 1 } })
  iniProfile = Schema<string>();
}
