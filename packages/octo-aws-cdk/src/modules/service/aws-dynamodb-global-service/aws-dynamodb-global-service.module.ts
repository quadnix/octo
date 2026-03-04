import { AModule, type App, Module } from '@quadnix/octo';
import { AwsDynamoDBGlobalAnchor } from '../../../anchors/aws-dynamodb/aws-dynamodb-global.anchor.js';
import { AwsDynamoDBAnchorSchema } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.schema.js';
import { AwsDynamoDBGlobalServiceModuleSchema } from './index.schema.js';
import { AwsDynamoDBGlobalService } from './models/service/index.js';

/**
 * `AwsDynamoDBGlobalServiceModule` is a global DynamoDB AWS service module that provides an implementation
 * for the `Service` model. It manages replicas of a global DynamoDB table.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsDynamoDBGlobalServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-dynamodb-global-service';
 *
 * octo.loadModule(AwsDynamoDBGlobalServiceModule, 'my-global-table-module', {
 *   dynamoDBService: myDynamoDBService,
 *   replicas: [{ region: myRegion, tags: { key1: 'value1' }],
 * });
 * ```
 *
 * @group Modules/Service/AwsDynamoDBService
 *
 * @reference Resources {@link DynamoDBGlobalSchema}
 *
 * @see {@link AwsDynamoDBGlobalServiceModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Service} to learn more about the `Service` model.
 */
@Module<AwsDynamoDBGlobalServiceModule>('@octo', AwsDynamoDBGlobalServiceModuleSchema)
export class AwsDynamoDBGlobalServiceModule extends AModule<
  AwsDynamoDBGlobalServiceModuleSchema,
  AwsDynamoDBGlobalService
> {
  async onInit(inputs: AwsDynamoDBGlobalServiceModuleSchema): Promise<AwsDynamoDBGlobalService> {
    const { app, tableName } = await this.registerMetadata(inputs);

    // Create a new global DynamoDB.
    const service = new AwsDynamoDBGlobalService(tableName);
    app.addService(service);

    // Add anchors.
    const dynamoDBGlobalAnchor = new AwsDynamoDBGlobalAnchor(
      'AwsDynamoDBGlobalAnchor',
      { TableName: tableName },
      service,
    );
    service.addAnchor(dynamoDBGlobalAnchor);

    return service;
  }

  override async registerMetadata(
    inputs: AwsDynamoDBGlobalServiceModuleSchema,
  ): Promise<{ app: App; tableName: string }> {
    const dynamoDBService = inputs.dynamoDBService;
    const app = dynamoDBService.getParents()['app'][0].to as App;

    // Get AWS DynamoDB table name.
    const [matchingAnchor] = await dynamoDBService.getAnchorsMatchingSchema(AwsDynamoDBAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const tableName = matchingAnchor.getSchemaInstance().properties.TableName;

    return {
      app,
      tableName,
    };
  }
}
