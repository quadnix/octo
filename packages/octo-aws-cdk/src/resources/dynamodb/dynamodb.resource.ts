import { AResource, Diff, DiffUtility, Resource, ResourceError } from '@quadnix/octo';
import { DynamoDbSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<DynamoDb>('@octo', 'dynamodb', DynamoDbSchema)
export class DynamoDb extends AResource<DynamoDbSchema, DynamoDb> {
  declare properties: DynamoDbSchema['properties'];
  declare response: DynamoDbSchema['response'];

  constructor(resourceId: string, properties: DynamoDbSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(previous: DynamoDb): Promise<Diff[]> {
    if (
      previous.properties.tableName !== this.properties.tableName ||
      !DiffUtility.isObjectDeepEquals(previous.properties.keySchema, this.properties.keySchema) ||
      !DiffUtility.isObjectDeepEquals(
        previous.properties.localSecondaryIndexes ?? [],
        this.properties.localSecondaryIndexes ?? [],
      )
    ) {
      throw new ResourceError(
        'Cannot update DynamoDB immutable properties (tableName, keySchema, localSecondaryIndexes) once it has been created!',
        this,
      );
    }

    return super.diffProperties(previous);
  }
}
