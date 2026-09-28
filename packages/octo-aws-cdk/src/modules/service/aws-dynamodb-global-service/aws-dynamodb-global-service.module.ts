import { AModule, Module } from '@quadnix/octo';
import { AwsDynamoDBGlobalAnchor } from '../../../anchors/aws-dynamodb/aws-dynamodb-global.anchor.js';
import { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import { AwsDynamoDBGlobalServiceModuleSchema } from './index.schema.js';
import { AwsDynamoDBGlobalService } from './models/service/index.js';

/**
 * `AwsDynamoDBGlobalServiceModule` is a global DynamoDB AWS service module that provides an implementation
 * for the `Service` model. It manages replicas of a global DynamoDB table. The global table sits under
 * the table it replicates, with an edge to each region it is replicated into.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Region, type Service, stub } from '@quadnix/octo';
 * import { AwsDynamoDBGlobalServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-dynamodb-global-service';
 *
 * octo.loadModule(AwsDynamoDBGlobalServiceModule, 'my-global-table-module', {
 *   dynamoDBService: stub<Service>('${{my-dynamodb-module.model.service}}'),
 *   replicas: [{ region: stub<Region>('${{my-replica-region-module.model.region}}'), tags: { key1: 'value1' } }],
 * });
 * ```
 *
 * @group Modules/Service/AwsDynamoDBGlobalService
 *
 * @reference Resources {@link DynamoDBGlobalSchema}
 *
 * @see {@link AwsDynamoDBGlobalServiceModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Service](/api/octo/class/Service) to learn more about the `Service` model.
 */
@Module<AwsDynamoDBGlobalServiceModule>('@octo', AwsDynamoDBGlobalServiceModuleSchema)
export class AwsDynamoDBGlobalServiceModule extends AModule<
  AwsDynamoDBGlobalServiceModuleSchema,
  AwsDynamoDBGlobalService
> {
  /**
   * Creates the global table service over an existing DynamoDB table, and anchors it for its replicas.
   */
  async onInit(inputs: AwsDynamoDBGlobalServiceModuleSchema): Promise<AwsDynamoDBGlobalService> {
    const { tableName } = await this.registerMetadata(inputs);

    // Create a new global DynamoDB.
    const service = new AwsDynamoDBGlobalService(tableName, inputs.dynamoDBService);
    for (const { region } of inputs.replicas) {
      service.addReplicaRegion(region);
    }

    // Add anchors.
    const dynamoDBGlobalAnchor = new AwsDynamoDBGlobalAnchor(
      'AwsDynamoDBGlobalAnchor',
      { TableName: tableName },
      service,
    );
    service.addAnchor(dynamoDBGlobalAnchor);

    return service;
  }

  /**
   * Resolves the name of the table being replicated.
   */
  override async registerMetadata(inputs: AwsDynamoDBGlobalServiceModuleSchema): Promise<{ tableName: string }> {
    const dynamoDBService = inputs.dynamoDBService;

    // Get AWS DynamoDB table name.
    const [matchingAnchor] = await dynamoDBService.getAnchorsMatchingSchema(AwsDynamoDBAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const tableName = matchingAnchor.getSchemaInstance().properties.TableName;

    return {
      tableName,
    };
  }
}
