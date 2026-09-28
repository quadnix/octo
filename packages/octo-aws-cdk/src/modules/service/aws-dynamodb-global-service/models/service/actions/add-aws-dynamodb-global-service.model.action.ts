import {
  type Account,
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  hasNodeName,
} from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../../../../anchors/aws-region/aws-region.anchor.schema.js';
import { DynamoDBSchema } from '../../../../../../resources/dynamodb/index.schema.js';
import { DynamoDBGlobal } from '../../../../../../resources/dynamodb-global/index.js';
import type { DynamoDBGlobalReplicaSchema } from '../../../../../../resources/dynamodb-global/index.schema.js';
import type { AwsDynamoDBGlobalServiceModule } from '../../../aws-dynamodb-global-service.module.js';
import { AwsDynamoDBGlobalService } from '../aws-dynamodb-global-service.model.js';

/**
 * @internal
 */
@Action(AwsDynamoDBGlobalService)
export class AddAwsDynamoDBGlobalServiceModelAction implements IModelAction<AwsDynamoDBGlobalServiceModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsDynamoDBGlobalService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'serviceId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsDynamoDBGlobalService>,
    actionInputs: EnhancedModuleSchema<AwsDynamoDBGlobalServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { tableName } = diff.node;
    const { dynamoDBService: service, replicas } = actionInputs.inputs;

    const [matchingDynamoDBResource] = await service.getResourcesMatchingSchema(
      DynamoDBSchema,
      [{ key: 'TableName', value: tableName }],
      [],
      { searchBoundaryMembers: false },
    );
    const { awsAccountId: tableAwsAccountId, awsRegionId: tableAwsRegionId } =
      matchingDynamoDBResource.getSchemaInstance().properties;

    const globalReplicas: DynamoDBGlobalReplicaSchema[] = [];
    for (const replica of replicas) {
      // Get AWS Account ID.
      const account = replica.region.getParents()['account'][0].to as Account;
      const awsAccountId = account.accountId;

      // Get AWS Region ID.
      const [matchingAnchor] = await replica.region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;

      // One replica per AWS region, and none where the table itself already is.
      if (awsAccountId === tableAwsAccountId && awsRegionId === tableAwsRegionId) {
        continue;
      }
      if (globalReplicas.some((r) => r.awsAccountId === awsAccountId && r.awsRegionId === awsRegionId)) {
        continue;
      }

      globalReplicas.push({
        awsAccountId,
        awsRegionId,
        tags: replica.tags || {},
      });
    }

    if (globalReplicas.length === 0) {
      return actionOutputs;
    }

    const dynamoDbGlobal = new DynamoDBGlobal(
      `dynamodb-global-${tableName}`,
      {
        replicas: globalReplicas,
      },
      [matchingDynamoDBResource],
    );

    actionOutputs[dynamoDbGlobal.resourceId] = dynamoDbGlobal;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsDynamoDBGlobalServiceModelAction>(AddAwsDynamoDBGlobalServiceModelAction)
export class AddAwsDynamoDBGlobalServiceModelActionFactory {
  private static instance: AddAwsDynamoDBGlobalServiceModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsDynamoDBGlobalServiceModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsDynamoDBGlobalServiceModelAction();
    }
    return this.instance;
  }
}
