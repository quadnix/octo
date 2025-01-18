import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import { EfsMountTarget } from '../../../../../../resources/efs-mount-target/index.js';
import { Subnet } from '../../../../../../resources/subnet/index.js';
import { type AwsSubnetModule, EfsResourceSchema, VpcResourceSchema } from '../../../aws-subnet.module.js';
import { AwsSubnetLocalFilesystemMountOverlay } from '../aws-subnet-local-filesystem-mount.overlay.js';

@Action(AwsSubnetLocalFilesystemMountOverlay)
export class AddSubnetLocalFilesystemMountOverlayAction implements IModelAction<AwsSubnetModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsSubnetLocalFilesystemMountOverlay &&
      (diff.node.constructor as typeof AwsSubnetLocalFilesystemMountOverlay).NODE_NAME ===
        'subnet-local-filesystem-mount-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsSubnetModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const subnetLocalFilesystemMountOverlay = diff.node as AwsSubnetLocalFilesystemMountOverlay;
    const properties = subnetLocalFilesystemMountOverlay.properties;

    const [[vpcSynth]] = await subnetLocalFilesystemMountOverlay.getResourcesMatchingSchema(VpcResourceSchema);
    const [[, efs]] = await subnetLocalFilesystemMountOverlay.getResourcesMatchingSchema(EfsResourceSchema);
    const subnet = actionInputs.resources[`subnet-${subnetLocalFilesystemMountOverlay.properties.subnetId}`] as Subnet;

    // Create EFS Mount Target.
    const efsMountTarget = new EfsMountTarget(
      `efs-mount-${properties.regionId}-${properties.subnetName}-${properties.filesystemName}`,
      { awsRegionId: vpcSynth.properties.awsRegionId },
      [efs, subnet],
    );

    actionOutputs[efsMountTarget.resourceId] = efsMountTarget;
    return actionOutputs;
  }
}

@Factory<AddSubnetLocalFilesystemMountOverlayAction>(AddSubnetLocalFilesystemMountOverlayAction)
export class AddSubnetLocalFilesystemMountOverlayActionFactory {
  private static instance: AddSubnetLocalFilesystemMountOverlayAction;

  static async create(): Promise<AddSubnetLocalFilesystemMountOverlayAction> {
    if (!this.instance) {
      this.instance = new AddSubnetLocalFilesystemMountOverlayAction();
    }
    return this.instance;
  }
}
