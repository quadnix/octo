import { AccountSchema, Schema, Validate } from '@quadnix/octo';

export class AwsCredentialsAccountSchema extends AccountSchema {
  @Validate({
    destruct: (value: AwsCredentialsAccountSchema['credentials']): string[] => [
      value.accessKeyId,
      value.secretAccessKey,
    ],
    options: { minLength: 1 },
  })
  credentials = Schema<{ accessKeyId: string; secretAccessKey: string }>();
}
