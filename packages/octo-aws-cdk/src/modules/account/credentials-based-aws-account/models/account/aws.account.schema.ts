import { AccountSchema, Schema, Validate } from '@quadnix/octo';

export class AwsAccountSchema extends AccountSchema {
  @Validate({
    destruct: (value: AwsAccountSchema['credentials']): string[] => [value.accessKeyId, value.secretAccessKey],
    options: { minLength: 1 },
  })
  credentials = Schema<{ accessKeyId: string; secretAccessKey: string }>();
}
