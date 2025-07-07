import { type App, AppSchema, Schema, Validate } from '@quadnix/octo';

/**
 * @group Modules/Account/LocalstackBasedAwsAccount
 */
export class AwsLocalstackAccountModuleSchema {
  @Validate({ options: { isSchema: { schema: AppSchema } } })
  app = Schema<App>();

  @Validate({
    destruct: (value: AwsLocalstackAccountModuleSchema['endpoint']): string[] => [value!],
    options: { minLength: 1 },
  })
  endpoint? = Schema<string>('http://localhost:4566');

  @Validate({
    destruct: (value: AwsLocalstackAccountModuleSchema['endpointS3']): string[] => [value!],
    options: { minLength: 1 },
  })
  endpointS3? = Schema<string>('http://s3.localhost.localstack.cloud:4566');
}
