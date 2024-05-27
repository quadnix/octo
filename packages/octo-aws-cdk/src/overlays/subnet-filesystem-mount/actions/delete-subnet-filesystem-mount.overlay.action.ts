import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, IModelAction, ModelType } from '@quadnix/octo';
import { RegionFilesystemAnchor } from '../../../anchors/region-filesystem.anchor.js';
import { SubnetFilesystemMountAnchor } from '../../../anchors/subnet-filesystem-mount.anchor.js';
import { AwsRegion } from '../../../models/region/aws.region.model.js';
import { AwsSubnet } from '../../../models/subnet/aws.subnet.model.js';
import { EfsMountTarget } from '../../../resources/efs/efs-mount-target.resource.js';
import { Efs } from '../../../resources/efs/efs.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { SubnetFilesystemMountOverlay } from '../subnet-filesystem-mount.overlay.js';

@Action(ModelType.OVERLAY)
export class DeleteSubnetFilesystemMountOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteSubnetFilesystemMountOverlayAction';

  collectInput(diff: Diff): string[] {
    const subnetFilesystemMountOverlay = diff.model as SubnetFilesystemMountOverlay;

    const regionFilesystemAnchor = subnetFilesystemMountOverlay.getAnchors()[0] as RegionFilesystemAnchor;
    const region = regionFilesystemAnchor.getParent() as AwsRegion;

    const subnetFilesystemMountAnchor = subnetFilesystemMountOverlay.getAnchors()[1] as SubnetFilesystemMountAnchor;
    const awsSubnet = subnetFilesystemMountAnchor.getParent() as AwsSubnet;

    return [
      // eslint-disable-next-line max-len
      `resource.efs-mount-${region.awsRegionId}-${awsSubnet.subnetName}-${regionFilesystemAnchor.filesystemName}-filesystem`,
    ];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
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
      `resource.efs-${region.awsRegionId}-${regionFilesystemAnchor.filesystemName}-filesystem`
    ] as Efs;
    const subnet = actionInputs[`resource.subnet-${awsSubnet.subnetId}`] as Subnet;

    // Delete EFS Mount.
    const efsMountTarget = actionInputs[
      // eslint-disable-next-line max-len
      `resource.efs-mount-${region.awsRegionId}-${awsSubnet.subnetName}-${regionFilesystemAnchor.filesystemName}-filesystem`
    ] as EfsMountTarget;
    efsMountTarget.removeRelationship(subnet);
    efsMountTarget.removeRelationship(efs);
    efsMountTarget.markDeleted();

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