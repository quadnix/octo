import { Model, Service, Validate } from '@quadnix/octo';
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
  constructor(tableName: AwsDynamoDBServiceSchema['tableName']) {
    super(`${tableName}-dynamodb`);

    this.tableName = tableName;
  }

  /**
   * @internal
   */
  static override async unSynth(service: AwsDynamoDBServiceSchema): Promise<AwsDynamoDBService> {
    return new AwsDynamoDBService(service.tableName);
  }

  /**
   * @internal
   */
  override synth(): AwsDynamoDBServiceSchema {
    return {
      serviceId: this.serviceId,
      tableName: this.tableName,
    };
  }
}
