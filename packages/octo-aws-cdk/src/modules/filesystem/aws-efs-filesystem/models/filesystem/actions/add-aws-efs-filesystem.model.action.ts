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
import { Efs } from '../../../../../../resources/efs/index.js';
import type { AwsEfsFilesystemModule } from '../../../aws-efs-filesystem.module.js';
import { AwsEfsFilesystem } from '../aws-efs-filesystem.model.js';

/**
 * @internal
 */
@Action(AwsEfsFilesystem)
export class AddAwsEfsFilesystemModelAction implements IModelAction<AwsEfsFilesystemModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEfsFilesystem &&
      hasNodeName(diff.node, 'filesystem') &&
      diff.field === 'filesystemName'
    );
  }

  async handle(
    diff: Diff<AwsEfsFilesystem>,
    actionInputs: EnhancedModuleSchema<AwsEfsFilesystemModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const filesystem = diff.node;
    const region = actionInputs.inputs.region;

    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    // Create EFS.
    const efs = new Efs(
      `efs-${region.regionId}-${filesystem.filesystemName}`,
      { awsAccountId, awsRegionId, filesystemName: filesystem.filesystemName },
      [],
    );

    actionOutputs[efs.resourceId] = efs;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEfsFilesystemModelAction>(AddAwsEfsFilesystemModelAction)
export class AddAwsEfsFilesystemModelActionFactory {
  private static instance: AddAwsEfsFilesystemModelAction;

  static async create(): Promise<AddAwsEfsFilesystemModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsEfsFilesystemModelAction();
    }
    return this.instance;
  }
}
