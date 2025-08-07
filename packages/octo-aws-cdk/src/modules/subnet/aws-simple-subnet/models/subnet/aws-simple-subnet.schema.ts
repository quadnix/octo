import { Schema, SubnetSchema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsSimpleSubnetSchema extends SubnetSchema {
  @Validate({
    destruct: (value: AwsSimpleSubnetSchema['optionsExtension']): string[] => [String(value!.createNatGateway)],
    options: { minLength: 1 },
  })
  optionsExtension = Schema<{
    createNatGateway: boolean;
  }>();
}
