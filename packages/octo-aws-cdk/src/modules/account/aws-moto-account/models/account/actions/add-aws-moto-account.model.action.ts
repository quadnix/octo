import {
  Action,
  type ActionOutputs,
  Container,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  ModelActionExceptionTransactionError,
  type Region,
  hasNodeName,
} from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../../../../anchors/aws-region/aws-region.anchor.schema.js';
import { OctoTerraform, type OctoTerraformFactory } from '../../../../../../factories/octo-terraform.factory.js';
import type { AwsMotoAccountModule } from '../../../aws-moto-account.module.js';
import { AwsMotoAccount } from '../aws-moto-account.model.js';

/**
 * @internal
 */
@Action(AwsMotoAccount)
export class AddAwsMotoAccountModelAction implements IModelAction<AwsMotoAccountModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsMotoAccount &&
      hasNodeName(diff.node, 'account') &&
      diff.field === 'accountId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsMotoAccountModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const account = diff.node as AwsMotoAccount;

    const octoTerraform = await Container.getInstance().get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const childRegions = account.getChildren()['region']?.map((r) => r.to as Region) || [];
    for (const region of childRegions) {
      const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      if (!matchingAnchor) {
        throw new ModelActionExceptionTransactionError(
          'Region child of AWS Account model must have AwsRegionAnchor!',
          diff,
          this.constructor.name,
        );
      }

      const awsRegionId = matchingAnchor.getSchemaInstance().properties.awsRegionId;
      octoTerraform.addTerraformProvider(account.accountId, awsRegionId, {
        access_key: 'test',
        secret_key: 'test',
        skip_credentials_validation: true,
        skip_requesting_account_id: true,
        ...(Object.keys(actionInputs.inputs.endpoints!).length > 0 ? { endpoints: actionInputs.inputs.endpoints } : {}),
      });
    }

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsMotoAccountModelAction>(AddAwsMotoAccountModelAction)
export class AddAwsMotoAccountModelActionFactory {
  private static instance: AddAwsMotoAccountModelAction;

  static async create(): Promise<AddAwsMotoAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsMotoAccountModelAction();
    }
    return this.instance;
  }
}
