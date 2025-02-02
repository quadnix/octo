import { AccountSchema, Schema, Validate } from '@quadnix/octo';

export class AwsAccountSchema extends AccountSchema {
  @Validate({ options: { minLength: 1 } })
  iniProfile = Schema<string>();
}
