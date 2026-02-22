import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import { DynamoDB } from '../../../../../../resources/dynamodb/index.js';
import type { AwsDynamoDBServiceModule } from '../../../aws-dynamodb-service.module.js';
import { AwsDynamoDBService } from '../aws-dynamodb-service.model.js';

/**
 * @internal
 */
@Action(AwsDynamoDBService)
export class AddAwsDynamoDBServiceModelAction implements IModelAction<AwsDynamoDBServiceModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsDynamoDBService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'serviceId'
    );
  }

  async handle(
    diff: Diff<AwsDynamoDBService>,
    actionInputs: EnhancedModuleSchema<AwsDynamoDBServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { tableName } = diff.node;
    const { awsAccountId, awsRegionId } = actionInputs.metadata;
    const inputs = actionInputs.inputs;

    const dynamoDb = new DynamoDB(`dynamodb-${tableName}`, {
      AttributeDefinitions: inputs.AttributeDefinitions,
      awsAccountId,
      awsRegionId,
      billingMode: inputs.billingMode,
      DeletionProtectionEnabled: false,
      GlobalSecondaryIndexes: inputs.GlobalSecondaryIndexes ?? [],
      KeySchema: inputs.KeySchema,
      LocalSecondaryIndexes: inputs.LocalSecondaryIndexes ?? [],
      ...(inputs.StreamSpecification ? { StreamSpecification: inputs.StreamSpecification } : {}),
      TableClass: 'STANDARD',
      TableName: tableName,
      ...(inputs.timeToLiveAttribute ? { timeToLiveAttribute: inputs.timeToLiveAttribute } : {}),
    });

    actionOutputs[dynamoDb.resourceId] = dynamoDb;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsDynamoDBServiceModelAction>(AddAwsDynamoDBServiceModelAction)
export class AddAwsDynamoDBServiceModelActionFactory {
  private static instance: AddAwsDynamoDBServiceModelAction;

  static async create(): Promise<AddAwsDynamoDBServiceModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsDynamoDBServiceModelAction();
    }
    return this.instance;
  }
}
