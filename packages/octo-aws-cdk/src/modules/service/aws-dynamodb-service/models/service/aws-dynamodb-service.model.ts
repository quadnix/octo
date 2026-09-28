import { type AModel, Model, type Region, Service, ServiceType, Validate } from '@quadnix/octo';
import { AwsDynamoDBServiceSchema } from './aws-dynamodb-service.schema.js';

/**
 * @internal
 */
@Model<AwsDynamoDBService>('@octo', 'service', AwsDynamoDBServiceSchema)
export class AwsDynamoDBService extends Service {
  @Validate({ options: { maxLength: 255, minLength: 3, regex: /^[\w.-]+$/ } })
  readonly tableName: string;

  /**
   * @internal
   */
  constructor(tableName: AwsDynamoDBServiceSchema['tableName'], region: Region) {
    super(`${tableName}-dynamodb`, [region], ServiceType.DATABASE, 'dynamodb');

    this.tableName = tableName;
  }

  /**
   * @internal
   */
  static override async unSynth(
    service: AwsDynamoDBServiceSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsDynamoDBService> {
    const region = (await deReferenceContext(service.parents[0].context)) as Region;
    return new AwsDynamoDBService(service.tableName, region);
  }

  /**
   * @internal
   */
  override synth(): AwsDynamoDBServiceSchema {
    return {
      ...super.synth(),
      tableName: this.tableName,
    };
  }
}
