import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import { RegionFilesystemAnchor } from '../../../anchors/region-filesystem.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../../anchors/subnet-filesystem-mount.anchor.js';
import type { AwsRegion } from '../../../models/region/aws.region.model.js';
import type { AwsSubnet } from '../../../models/subnet/aws.subnet.model.js';
import type { EfsMountTarget } from '../../../resources/efs/efs-mount-target.resource.js';
import type { Efs } from '../../../resources/efs/efs.resource.js';
import type { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { SubnetFilesystemMountOverlay } from '../subnet-filesystem-mount.overlay.js';

@Action(ModelType.OVERLAY)
export class DeleteSubnetFilesystemMountOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteSubnetFilesystemMountOverlayAction';

  collectInput(diff: Diff): string[] {
    const subnetFilesystemMountOverlay = diff.model as SubnetFilesystemMountOverlay;

    const regionFsAnchor = subnetFilesystemMountOverlay
      .getAnchors()
      .find((a) => a instanceof RegionFilesystemAnchor) as RegionFilesystemAnchor;
    const region = regionFsAnchor.getParent() as AwsRegion;

    const subnetFilesystemMountAnchor = subnetFilesystemMountOverlay
      .getAnchors()
      .find((a) => a instanceof SubnetFilesystemMountAnchor) as SubnetFilesystemMountAnchor;
    const awsSubnet = subnetFilesystemMountAnchor.getParent() as AwsSubnet;

    return [
      `resource.efs-${region.regionId}-${regionFsAnchor.properties.filesystemName}`,
      `resource.subnet-${awsSubnet.subnetId}`,
      `resource.efs-mount-${region.regionId}-${awsSubnet.subnetName}-${regionFsAnchor.properties.filesystemName}`,
    ];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof SubnetFilesystemMountOverlay &&
      diff.model.MODEL_NAME === 'subnet-filesystem-mount-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const subnetFilesystemMountOverlay = diff.model as SubnetFilesystemMountOverlay;

    const regionFsAnchor = subnetFilesystemMountOverlay
      .getAnchors()
      .find((a) => a instanceof RegionFilesystemAnchor) as RegionFilesystemAnchor;
    const region = regionFsAnchor.getParent() as AwsRegion;

    const subnetFilesystemMountAnchor = subnetFilesystemMountOverlay
      .getAnchors()
      .find((a) => a instanceof SubnetFilesystemMountAnchor) as SubnetFilesystemMountAnchor;
    const awsSubnet = subnetFilesystemMountAnchor.getParent() as AwsSubnet;

    const efs = actionInputs[`resource.efs-${region.regionId}-${regionFsAnchor.properties.filesystemName}`] as Efs;
    const subnet = actionInputs[`resource.subnet-${awsSubnet.subnetId}`] as Subnet;

    // Delete EFS Mount.
    const efsMountTarget = actionInputs[
      `resource.efs-mount-${region.regionId}-${awsSubnet.subnetName}-${regionFsAnchor.properties.filesystemName}`
    ] as EfsMountTarget;
    efsMountTarget.removeRelationship(subnet);
    efsMountTarget.removeRelationship(efs);
    efsMountTarget.remove();

    const output: ActionOutputs = {};
    output[efsMountTarget.resourceId] = efsMountTarget;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}
@Factory<DeleteSubnetFilesystemMountOverlayAction>(DeleteSubnetFilesystemMountOverlayAction)
export class DeleteSubnetFilesystemMountOverlayActionFactory {
  static async create(): Promise<DeleteSubnetFilesystemMountOverlayAction> {
    return new DeleteSubnetFilesystemMountOverlayAction();
  }
}
