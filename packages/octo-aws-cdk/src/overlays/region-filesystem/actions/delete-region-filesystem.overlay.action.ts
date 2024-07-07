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
import { Efs } from '../../../resources/efs/efs.resource.js';
import { RegionFilesystemOverlay } from '../region-filesystem.overlay.js';

@Action(ModelType.OVERLAY)
export class DeleteRegionFilesystemOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteRegionFilesystemOverlayAction';

  collectInput(diff: Diff): string[] {
    const regionFilesystemOverlay = diff.model as RegionFilesystemOverlay;
    const properties = regionFilesystemOverlay.properties;

    return [`resource.efs-${properties.regionId}-${properties.filesystemName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof RegionFilesystemOverlay &&
      diff.model.MODEL_NAME === 'region-filesystem-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const regionFilesystemOverlay = diff.model as RegionFilesystemOverlay;
    const properties = regionFilesystemOverlay.properties;

    // Delete EFS.
    const efs = actionInputs[`resource.efs-${properties.regionId}-${properties.filesystemName}`] as Efs;
    efs.remove();
    actionOutputs[efs.resourceId] = efs;

    return actionOutputs;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteRegionFilesystemOverlayAction>(DeleteRegionFilesystemOverlayAction)
export class DeleteRegionFilesystemOverlayActionFactory {
  static async create(): Promise<DeleteRegionFilesystemOverlayAction> {
    return new DeleteRegionFilesystemOverlayAction();
  }
}
