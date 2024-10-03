import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  type Diff,
  DiffAction,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import { FilesystemAnchor } from '../../../anchors/filesystem.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../../anchors/subnet-filesystem-mount.anchor.js';
import { EfsMountTarget } from '../../../resources/efs-mount-target/index.js';
import type { Efs } from '../../../resources/efs/index.js';
import type { Subnet } from '../../../resources/subnet/index.js';
import { SubnetFilesystemMountOverlay } from '../subnet-filesystem-mount.overlay.js';

@Action(SubnetFilesystemMountOverlay)
export class AddSubnetFilesystemMountOverlayAction implements IModelAction {
  collectInput(diff: Diff): string[] {
    const subnetFilesystemMountOverlay = diff.node as SubnetFilesystemMountOverlay;

    const filesystemAnchor = subnetFilesystemMountOverlay.getAnchors([], [FilesystemAnchor])[0] as FilesystemAnchor;
    const filesystemName = filesystemAnchor.properties.filesystemName;
    const regionId = filesystemAnchor.properties.regionId;

    const subnetFilesystemMountAnchor = subnetFilesystemMountOverlay.getAnchors(
      [],
      [SubnetFilesystemMountAnchor],
    )[0] as SubnetFilesystemMountAnchor;
    const subnetId = subnetFilesystemMountAnchor.properties.subnetId;

    return [`resource.efs-${regionId}-${filesystemName}`, `resource.subnet-${subnetId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof SubnetFilesystemMountOverlay &&
      (diff.node.constructor as typeof SubnetFilesystemMountOverlay).NODE_NAME === 'subnet-filesystem-mount-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const subnetFilesystemMountOverlay = diff.node as SubnetFilesystemMountOverlay;

    const filesystemAnchor = subnetFilesystemMountOverlay.getAnchors([], [FilesystemAnchor])[0] as FilesystemAnchor;
    const awsRegionId = filesystemAnchor.properties.awsRegionId;
    const filesystemName = filesystemAnchor.properties.filesystemName;
    const regionId = filesystemAnchor.properties.regionId;

    const subnetFilesystemMountAnchor = subnetFilesystemMountOverlay.getAnchors(
      [],
      [SubnetFilesystemMountAnchor],
    )[0] as SubnetFilesystemMountAnchor;
    const subnetId = subnetFilesystemMountAnchor.properties.subnetId;
    const subnetName = subnetFilesystemMountAnchor.properties.subnetName;

    const efs = actionInputs[`resource.efs-${regionId}-${filesystemName}`] as Efs;
    const subnet = actionInputs[`resource.subnet-${subnetId}`] as Subnet;

    // Create EFS Mount.
    const efsMountTarget = new EfsMountTarget(
      `efs-mount-${regionId}-${subnetName}-${filesystemName}`,
      { awsRegionId },
      [efs, subnet],
    );
    actionOutputs[efsMountTarget.resourceId] = efsMountTarget;

    return actionOutputs;
  }
}

@Factory<AddSubnetFilesystemMountOverlayAction>(AddSubnetFilesystemMountOverlayAction)
export class AddSubnetFilesystemMountOverlayActionFactory {
  static async create(): Promise<AddSubnetFilesystemMountOverlayAction> {
    return new AddSubnetFilesystemMountOverlayAction();
  }
}
