import { Schema, ServiceSchema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsDynamoDBGlobalServiceSchema extends ServiceSchema {
  @Validate({ options: { maxLength: 255, minLength: 3, regex: /^[\w.-]+$/ } })
  tableName = Schema<string>();
}
