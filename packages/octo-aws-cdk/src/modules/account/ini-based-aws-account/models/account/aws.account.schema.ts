import { AccountSchema, Schema } from '@quadnix/octo';

export class AwsAccountSchema extends AccountSchema {
  iniProfile = Schema<string>();
}
