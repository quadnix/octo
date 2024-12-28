import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import { Efs } from '../../../../../../resources/efs/index.js';
import { AwsFilesystemModule, AwsResourceSchema } from '../../../aws-filesystem.module.js';
import { AwsFilesystem } from '../aws.filesystem.model.js';

@Action(AwsFilesystem)
export class AddFilesystemModelAction implements IModelAction<AwsFilesystemModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsFilesystem &&
      (diff.node.constructor as typeof AwsFilesystem).NODE_NAME === 'filesystem' &&
      diff.field === 'filesystemName'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsFilesystemModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const filesystem = diff.node as AwsFilesystem;
    const region = actionInputs.inputs.region;

    // Get AWS Region ID.
    const [resourceSynth] = (await region.getResourceMatchingSchema(AwsResourceSchema))!;
    const awsRegionId = resourceSynth.properties.awsRegionId;

    // Create EFS.
    const efs = new Efs(
      `efs-${region.regionId}-${filesystem.filesystemName}`,
      { awsRegionId, filesystemName: filesystem.filesystemName },
      [],
    );

    actionOutputs[efs.resourceId] = efs;
    return actionOutputs;
  }
}

@Factory<AddFilesystemModelAction>(AddFilesystemModelAction)
export class AddFilesystemModelActionFactory {
  private static instance: AddFilesystemModelAction;

  static async create(): Promise<AddFilesystemModelAction> {
    if (!this.instance) {
      this.instance = new AddFilesystemModelAction();
    }
    return this.instance;
  }
}
