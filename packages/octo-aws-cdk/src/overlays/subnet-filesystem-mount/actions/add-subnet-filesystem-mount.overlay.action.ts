import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionInputs, ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import type { RegionFilesystemAnchor } from '../../../anchors/region-filesystem.anchor.js';
import type { SubnetFilesystemMountAnchor } from '../../../anchors/subnet-filesystem-mount.anchor.js';
import type { AwsRegion } from '../../../models/region/aws.region.model.js';
import type { AwsSubnet } from '../../../models/subnet/aws.subnet.model.js';
import { EfsMountTarget } from '../../../resources/efs/efs-mount-target.resource.js';
import type { Efs } from '../../../resources/efs/efs.resource.js';
import type { Subnet } from '../../../resources/subnet/subnet.resource.js';
import type { SubnetFilesystemMountOverlay } from '../subnet-filesystem-mount.overlay.js';

@Action(ModelType.OVERLAY)
export class AddSubnetFilesystemMountOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddSubnetFilesystemMountOverlayAction';

  collectInput(diff: Diff): string[] {
    const subnetFilesystemMountOverlay = diff.model as SubnetFilesystemMountOverlay;

    const regionFilesystemAnchor = subnetFilesystemMountOverlay.getAnchors()[0] as RegionFilesystemAnchor;
    const region = regionFilesystemAnchor.getParent() as AwsRegion;

    const subnetFilesystemMountAnchor = subnetFilesystemMountOverlay.getAnchors()[1] as SubnetFilesystemMountAnchor;
    const subnet = subnetFilesystemMountAnchor.getParent() as AwsSubnet;

    return [
      `resource.efs-${region.regionId}-${regionFilesystemAnchor.filesystemName}-filesystem`,
      `resource.subnet-${subnet.subnetId}`,
    ];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model.MODEL_NAME === 'subnet-filesystem-mount-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const subnetFilesystemMountOverlay = diff.model as SubnetFilesystemMountOverlay;

    const regionFilesystemAnchor = subnetFilesystemMountOverlay.getAnchors()[0] as RegionFilesystemAnchor;
    const region = regionFilesystemAnchor.getParent() as AwsRegion;

    const subnetFilesystemMountAnchor = subnetFilesystemMountOverlay.getAnchors()[1] as SubnetFilesystemMountAnchor;
    const awsSubnet = subnetFilesystemMountAnchor.getParent() as AwsSubnet;

    const efs = actionInputs[
      `resource.efs-${region.regionId}-${regionFilesystemAnchor.filesystemName}-filesystem`
    ] as Efs;
    const subnet = actionInputs[`resource.subnet-${awsSubnet.subnetId}`] as Subnet;

    // Create EFS Mount.
    const efsMountTarget = new EfsMountTarget(
      `efs-mount-${region.regionId}-${awsSubnet.subnetName}-${regionFilesystemAnchor.filesystemName}-filesystem`,
      { awsRegionId: region.awsRegionId },
      [efs, subnet],
    );

    const output: ActionOutputs = {};
    output[efsMountTarget.resourceId] = efsMountTarget;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddSubnetFilesystemMountOverlayAction>(AddSubnetFilesystemMountOverlayAction)
export class AddSubnetFilesystemMountOverlayActionFactory {
  static async create(): Promise<AddSubnetFilesystemMountOverlayAction> {
    return new AddSubnetFilesystemMountOverlayAction();
  }
}
