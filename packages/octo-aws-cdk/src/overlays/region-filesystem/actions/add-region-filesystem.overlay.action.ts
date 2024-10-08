import {
  Action,
  ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  NodeType,
} from '@quadnix/octo';
import { Efs } from '../../../resources/efs/efs.resource.js';
import { RegionFilesystemOverlay } from '../region-filesystem.overlay.js';

@Action(NodeType.OVERLAY)
export class AddRegionFilesystemOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddRegionFilesystemOverlayAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof RegionFilesystemOverlay &&
      diff.node.NODE_NAME === 'region-filesystem-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const regionFilesystemOverlay = diff.node as RegionFilesystemOverlay;
    const properties = regionFilesystemOverlay.properties;

    // Create EFS.
    const efs = new Efs(
      `efs-${properties.regionId}-${properties.filesystemName}`,
      { awsRegionId: properties.awsRegionId, filesystemName: properties.filesystemName },
      [],
    );
    actionOutputs[efs.resourceId] = efs;

    return actionOutputs;
  }
}

@Factory<AddRegionFilesystemOverlayAction>(AddRegionFilesystemOverlayAction)
export class AddRegionFilesystemOverlayActionFactory {
  static async create(): Promise<AddRegionFilesystemOverlayAction> {
    return new AddRegionFilesystemOverlayAction();
  }
}
