import { Model, Service, Validate } from '@quadnix/octo';
import { AwsDynamoDBGlobalServiceSchema } from './aws-dynamodb-global-service.schema.js';

/**
 * @internal
 */
@Model<AwsDynamoDBGlobalService>('@octo', 'service', AwsDynamoDBGlobalServiceSchema)
export class AwsDynamoDBGlobalService extends Service {
  @Validate({ options: { maxLength: 255, minLength: 3, regex: /^[\w.-]+$/ } })
  readonly tableName: string;

  constructor(tableName: AwsDynamoDBGlobalServiceSchema['tableName']) {
    super(`${tableName}-global-dynamodb`);

    this.tableName = tableName;
  }

  static override async unSynth(service: AwsDynamoDBGlobalServiceSchema): Promise<AwsDynamoDBGlobalService> {
    return new AwsDynamoDBGlobalService(service.tableName);
  }

  override synth(): AwsDynamoDBGlobalServiceSchema {
    return {
      serviceId: this.serviceId,
      tableName: this.tableName,
    };
  }
}
