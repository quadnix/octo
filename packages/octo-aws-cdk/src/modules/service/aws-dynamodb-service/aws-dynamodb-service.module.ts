import { AModule, type Account, Module, ModuleError } from '@quadnix/octo';
import { AwsDynamoDBAnchor } from '../../../anchors/aws-dynamodb/aws-dynamodb.anchor.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsServerlessRegionAnchorSchema } from '../../../anchors/aws-region/aws-serverless-region.anchor.schema.js';
import { AwsDynamoDBServiceModuleSchema } from './index.schema.js';
import { AwsDynamoDBService } from './models/service/index.js';

/**
 * `AwsDynamoDBServiceModule` is a DynamoDB AWS service module that provides an implementation
 * for the `Service` model. It creates a single DynamoDB table with full support for key schemas,
 * indexes, streams, billing modes, and TTL.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Region, stub } from '@quadnix/octo';
 * import { AwsDynamoDBServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-dynamodb-service';
 *
 * octo.loadModule(AwsDynamoDBServiceModule, 'my-table-module', {
 *   AttributeDefinitions: [{ AttributeName: 'AccountId', AttributeType: 'S' }],
 *   billingMode: { settings: {}, type: 'PAY_PER_REQUEST' },
 *   KeySchema: [{ AttributeName: 'AccountId', KeyType: 'HASH' }],
 *   region: stub<Region>('${{my-region-module.model.region}}'),
 *   TableName: 'my-table',
 * });
 * ```
 *
 * @group Modules/Service/AwsDynamoDBService
 *
 * @reference Resources {@link DynamoDBSchema}
 *
 * @see {@link AwsDynamoDBServiceModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Service](/api/octo/class/Service) to learn more about the `Service` model.
 */
@Module<AwsDynamoDBServiceModule>('@octo', AwsDynamoDBServiceModuleSchema)
export class AwsDynamoDBServiceModule extends AModule<AwsDynamoDBServiceModuleSchema, AwsDynamoDBService> {
  /**
   * Creates the DynamoDB table service, and anchors its table name for other modules to find.
   */
  async onInit(inputs: AwsDynamoDBServiceModuleSchema): Promise<AwsDynamoDBService> {
    const { awsAccountId, awsRegionId } = await this.registerMetadata(inputs);

    // Create a new DynamoDB.
    const service = new AwsDynamoDBService(inputs.TableName, inputs.region);

    // Add anchors.
    const dynamoDBAnchor = new AwsDynamoDBAnchor(
      'AwsDynamoDBAnchor',
      { awsAccountId, awsRegionId, TableName: inputs.TableName },
      service,
    );
    service.addAnchor(dynamoDBAnchor);

    return service;
  }

  /**
   * Resolves the account and region this table is created in.
   * The region may be networked or serverless; the table only needs its AWS region ID.
   */
  override async registerMetadata(
    inputs: AwsDynamoDBServiceModuleSchema,
  ): Promise<{ awsAccountId: string; awsRegionId: string }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS Region ID.
    const [[matchingRegionAnchor], [matchingServerlessRegionAnchor]] = await Promise.all([
      region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], { searchBoundaryMembers: false }),
      region.getAnchorsMatchingSchema(AwsServerlessRegionAnchorSchema, [], { searchBoundaryMembers: false }),
    ]);
    const matchingAnchor = matchingRegionAnchor || matchingServerlessRegionAnchor;
    if (!matchingAnchor) {
      throw new ModuleError('Region is not an AWS region!', this.constructor.name);
    }
    const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

    return {
      awsAccountId: account.accountId,
      awsRegionId,
    };
  }
}
