import { type AModel, Model, type Region, Service, ServiceType, Validate } from '@quadnix/octo';
import { AwsDynamoDBGlobalServiceSchema } from './aws-dynamodb-global-service.schema.js';

/**
 * @internal
 */
@Model<AwsDynamoDBGlobalService>('@octo', 'service', AwsDynamoDBGlobalServiceSchema)
export class AwsDynamoDBGlobalService extends Service {
  @Validate({ options: { maxLength: 255, minLength: 3, regex: /^[\w.-]+$/ } })
  readonly tableName: string;

  /**
   * @internal
   */
  constructor(tableName: AwsDynamoDBGlobalServiceSchema['tableName'], dynamoDBService: Service) {
    super(`${tableName}-global-dynamodb`, [dynamoDBService], ServiceType.DATABASE, 'dynamodb-global-table');

    this.tableName = tableName;
  }

  /**
   * @internal
   */
  static override async unSynth(
    service: AwsDynamoDBGlobalServiceSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsDynamoDBGlobalService> {
    const dynamoDBService = (await deReferenceContext(service.parents[0].context)) as Service;
    return new AwsDynamoDBGlobalService(service.tableName, dynamoDBService);
  }

  /**
   * Draws an edge to a region this table is replicated into.
   */
  addReplicaRegion(region: Region): void {
    this.addRelationship(region);
  }

  /**
   * @internal
   */
  override synth(): AwsDynamoDBGlobalServiceSchema {
    return {
      ...super.synth(),
      tableName: this.tableName,
    };
  }
}
