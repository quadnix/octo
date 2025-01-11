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
import { AwsSubnetFilesystemMountOverlay } from '../aws-subnet-filesystem-mount.overlay.js';

@Action(AwsSubnetFilesystemMountOverlay)
export class AddSubnetFilesystemMountOverlayAction implements IModelAction<AwsSubnetModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsSubnetFilesystemMountOverlay &&
      (diff.node.constructor as typeof AwsSubnetFilesystemMountOverlay).NODE_NAME ===
        'subnet-filesystem-mount-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsSubnetModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const subnetFilesystemMountOverlay = diff.node as AwsSubnetFilesystemMountOverlay;
    const properties = subnetFilesystemMountOverlay.properties;

    const [[vpcSynth]] = await subnetFilesystemMountOverlay.getResourcesMatchingSchema(VpcResourceSchema);
    const [[, efs]] = await subnetFilesystemMountOverlay.getResourcesMatchingSchema(EfsResourceSchema);
    const subnet = actionInputs.resources[`subnet-${subnetFilesystemMountOverlay.properties.subnetId}`] as Subnet;

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

@Factory<AddSubnetFilesystemMountOverlayAction>(AddSubnetFilesystemMountOverlayAction)
export class AddSubnetFilesystemMountOverlayActionFactory {
  private static instance: AddSubnetFilesystemMountOverlayAction;

  static async create(): Promise<AddSubnetFilesystemMountOverlayAction> {
    if (!this.instance) {
      this.instance = new AddSubnetFilesystemMountOverlayAction();
    }
    return this.instance;
  }
}
