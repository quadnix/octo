import { Action, type Diff, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import { DynamoDBGlobal } from '../dynamodb-global.resource.js';
import type { DynamoDBGlobalSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(DynamoDBGlobal)
export class CaptureDynamoDBGlobalResponseResourceAction implements IResourceAction<DynamoDBGlobal> {
  filter(diff: Diff): boolean {
    return diff.node instanceof DynamoDBGlobal && hasNodeName(diff.node, 'dynamodb-global');
  }

  async handle(_diff: Diff<DynamoDBGlobal>): Promise<void> {}

  async mock(
    _diff: Diff<DynamoDBGlobal>,
    capture: Partial<DynamoDBGlobalSchema['response']>,
  ): Promise<DynamoDBGlobalSchema['response']> {
    const response: DynamoDBGlobalSchema['response'] = {};
    for (const [flatKey, value] of Object.entries(capture || {})) {
      if (value !== undefined) {
        response[flatKey] = value || response[flatKey];
      }
    }
    return response;
  }
}

@Factory<CaptureDynamoDBGlobalResponseResourceAction>(CaptureDynamoDBGlobalResponseResourceAction)
export class CaptureDynamoDBGlobalResponseResourceActionFactory {
  private static instance: CaptureDynamoDBGlobalResponseResourceAction;

  static async create(): Promise<CaptureDynamoDBGlobalResponseResourceAction> {
    if (!this.instance) {
      this.instance = new CaptureDynamoDBGlobalResponseResourceAction();
    }
    return this.instance;
  }
}
