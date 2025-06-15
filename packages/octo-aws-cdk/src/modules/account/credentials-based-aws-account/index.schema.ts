import { type App, AppSchema, Schema, Validate } from '@quadnix/octo';

export class AwsCredentialsAccountModuleSchema {
  @Validate({ options: { minLength: 1 } })
  accountId = Schema<string>();

  @Validate({ options: { isSchema: { schema: AppSchema } } })
  app = Schema<App>();

  @Validate({
    destruct: (value: AwsCredentialsAccountModuleSchema['credentials']): string[] => [
      value.accessKeyId,
      value.secretAccessKey,
    ],
    options: { minLength: 1 },
  })
  credentials = Schema<{ accessKeyId: string; secretAccessKey: string }>();

  @Validate({
    destruct: (value: AwsCredentialsAccountModuleSchema['endpoint']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  endpoint? = Schema<string | null>(null);
}
