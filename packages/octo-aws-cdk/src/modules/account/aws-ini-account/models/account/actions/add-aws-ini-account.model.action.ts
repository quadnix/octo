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
import type { AwsIniAccountModule } from '../../../aws-ini-account.module.js';
import { AwsIniAccount } from '../aws-ini-account.model.js';

/**
 * @internal
 */
@Action(AwsIniAccount)
export class AddAwsIniAccountModelAction implements IModelAction<AwsIniAccountModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsIniAccount &&
      hasNodeName(diff.node, 'account') &&
      diff.field === 'accountId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsIniAccountModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const account = diff.node as AwsIniAccount;

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
        profile: account.iniProfile,
        ...(Object.keys(actionInputs.inputs.endpoints!).length > 0 ? { endpoints: actionInputs.inputs.endpoints } : {}),
      });
    }

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsIniAccountModelAction>(AddAwsIniAccountModelAction)
export class AddAwsIniAccountModelActionFactory {
  private static instance: AddAwsIniAccountModelAction;

  static async create(): Promise<AddAwsIniAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsIniAccountModelAction();
    }
    return this.instance;
  }
}
