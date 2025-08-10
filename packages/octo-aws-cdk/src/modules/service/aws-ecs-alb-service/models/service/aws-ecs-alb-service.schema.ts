import { type IModelReference, Schema, ServiceSchema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsEcsAlbServiceSchema extends ServiceSchema {
  @Validate({ options: { minLength: 1 } })
  albName = Schema<string>();

  subnets = Schema<IModelReference[]>();
}
