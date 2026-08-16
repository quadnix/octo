import {
  type AModule,
  type Account,
  type App,
  type Constructable,
  Factory,
  type ModuleSchemaInputs,
  type Region,
  stub,
} from '@quadnix/octo';
import { AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-ini-account';
import { SimpleAppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
import { AwsSingleAzRegionModule } from '@quadnix/octo-aws-cdk/modules/region/aws-single-az-region';
import { AwsSingleAzRegionId } from '@quadnix/octo-aws-cdk/modules/region/aws-single-az-region/schema';
import { AwsDynamoDBServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-dynamodb-service';
import { config } from './app.config.js';

type ModuleDefinition<T extends AModule<unknown, any>> = {
  module: Constructable<T>;
  moduleId: string;
  moduleInputs: ModuleSchemaInputs<T>;
};

/**
 * The modules this template loads, and the inputs it loads them with.
 *
 * A test mutates the set - `update()` to change an input, `remove()` to drop a module - and runs the
 * lifecycle again, which is how the template exercises a change to live infrastructure.
 */
export class ModuleDefinitions {
  private readonly moduleDefinitions: ModuleDefinition<AModule<unknown, any>>[] = [];

  /**
   * Starts from the template's own set of modules.
   */
  constructor() {
    this.init();
  }

  /**
   * Appends a module definition to the end of the set.
   */
  add<T extends AModule<unknown, any>>(
    module: Constructable<T>,
    moduleId: string,
    moduleInputs: ModuleSchemaInputs<T>,
  ): void {
    this.moduleDefinitions.push({ module, moduleId, moduleInputs });
  }

  /**
   * Returns the definition of the given module id, or `undefined` when the set holds none.
   */
  get<T extends AModule<unknown, any>>(moduleId: string): ModuleDefinition<T> | undefined {
    return this.moduleDefinitions.find((m) => m.moduleId === moduleId) as ModuleDefinition<T>;
  }

  /**
   * Returns every definition, in the order the template loads them.
   */
  getAll(): ModuleDefinitions['moduleDefinitions'] {
    return this.moduleDefinitions;
  }

  /**
   * Drops the definition of the given module id. An id the set does not hold is not an error.
   */
  remove(moduleId: string): void {
    const index = this.moduleDefinitions.findIndex((m) => m.moduleId === moduleId);
    if (index > -1) {
      this.moduleDefinitions.splice(index, 1);
    }
  }

  /**
   * Replaces the definition of the given module id in place, keeping its load order, and appends it
   * when the set holds none.
   */
  update<T extends AModule<unknown, any>>(
    module: Constructable<T>,
    moduleId: string,
    moduleInputs: ModuleSchemaInputs<T>,
  ): void {
    const index = this.moduleDefinitions.findIndex((m) => m.moduleId === moduleId);
    if (index === -1) {
      this.add(module, moduleId, moduleInputs);
    } else {
      this.moduleDefinitions[index] = {
        module,
        moduleId,
        moduleInputs,
      };
    }
  }

  /**
   * Declares this template's infrastructure: an app, the AWS account hosting it, a single-AZ region,
   * and an `accounts` DynamoDB table with one global and one local secondary index.
   */
  private init(): void {
    this.add(SimpleAppModule, 'app-module', { name: 'aws-dynamodb-service' });

    this.add(AwsIniAccountModule, 'account-module', {
      accountId: config.AWS_ACCOUNT_ID,
      app: stub<App>('${{app-module.model.app}}'),
      iniProfile: 'default',
    });

    this.add(AwsSingleAzRegionModule, 'region-module', {
      account: stub<Account>('${{account-module.model.account}}'),
      name: 'app-region-east',
      regionId: AwsSingleAzRegionId.AWS_US_EAST_1A,
      vpcCidrBlock: '10.0.0.0/16',
    });

    this.add(AwsDynamoDBServiceModule, 'dynamodb-service-module', {
      AttributeDefinitions: [
        { AttributeName: 'AccountId', AttributeType: 'S' },
        { AttributeName: 'AccountType', AttributeType: 'S' },
        { AttributeName: 'CreatedAt', AttributeType: 'N' },
        { AttributeName: 'UserId', AttributeType: 'S' },
      ],
      billingMode: {
        settings: { ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 } },
        type: 'PROVISIONED',
      },
      GlobalSecondaryIndexes: [
        {
          IndexName: 'AccountUserIndex',
          KeySchema: [{ AttributeName: 'UserId', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      KeySchema: [
        { AttributeName: 'AccountId', KeyType: 'HASH' },
        { AttributeName: 'AccountType', KeyType: 'RANGE' },
      ],
      LocalSecondaryIndexes: [
        {
          IndexName: 'AccountCreatedAtIndex',
          KeySchema: [
            { AttributeName: 'AccountId', KeyType: 'HASH' },
            { AttributeName: 'CreatedAt', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      region: stub<Region>('${{region-module.model.region}}'),
      StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
      TableName: 'accounts',
      timeToLiveAttribute: 'ExpiresAt',
    });
  }
}

/**
 * Serves {@link ModuleDefinitions} through the container, so a test and the lifecycle it runs read
 * and mutate one set.
 */
@Factory<ModuleDefinitions>(ModuleDefinitions)
export class ModuleDefinitionsFactory {
  private static instance: ModuleDefinitions;

  /**
   * Returns the shared set, building it on the first call.
   */
  static async create(): Promise<ModuleDefinitions> {
    if (!this.instance) {
      this.instance = new ModuleDefinitions();
    }
    return this.instance;
  }
}
