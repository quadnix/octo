import { Schema, SubnetSchema, Validate } from '@quadnix/octo';

export class AwsSubnetSchema extends SubnetSchema {
  @Validate({
    destruct: (value: AwsSubnetSchema['optionsExtension']): string[] => [String(value!.createNatGateway)],
    options: { minLength: 1 },
  })
  optionsExtension = Schema<{
    createNatGateway: boolean;
  }>();
}
