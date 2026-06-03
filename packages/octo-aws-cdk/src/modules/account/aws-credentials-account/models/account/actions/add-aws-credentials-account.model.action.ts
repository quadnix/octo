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
import type { AwsCredentialsAccountModule } from '../../../aws-credentials-account.module.js';
import { AwsCredentialsAccount } from '../aws-credentials-account.model.js';

/**
 * @internal
 */
@Action(AwsCredentialsAccount)
export class AddAwsCredentialsAccountModelAction implements IModelAction<AwsCredentialsAccountModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsCredentialsAccount &&
      hasNodeName(diff.node, 'account') &&
      diff.field === 'accountId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsCredentialsAccountModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const account = diff.node as AwsCredentialsAccount;

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
        access_key: account.credentials.accessKeyId,
        secret_key: account.credentials.secretAccessKey,
        ...(Object.keys(actionInputs.inputs.endpoints!).length > 0 ? { endpoints: actionInputs.inputs.endpoints } : {}),
      });
    }

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsCredentialsAccountModelAction>(AddAwsCredentialsAccountModelAction)
export class AddAwsCredentialsAccountModelActionFactory {
  private static instance: AddAwsCredentialsAccountModelAction;

  static async create(): Promise<AddAwsCredentialsAccountModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsCredentialsAccountModelAction();
    }
    return this.instance;
  }
}
