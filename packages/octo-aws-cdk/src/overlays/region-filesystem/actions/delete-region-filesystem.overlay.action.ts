import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, IModelAction, ModelType } from '@quadnix/octo';
import { Efs } from '../../../resources/efs/efs.resource.js';
import { IRegionFilesystemOverlayProperties } from '../region-filesystem.overlay.interface.js';
import { RegionFilesystemOverlay } from '../region-filesystem.overlay.js';

@Action(ModelType.OVERLAY)
export class DeleteRegionFilesystemOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteRegionFilesystemOverlayAction';

  collectInput(diff: Diff): string[] {
    const regionFilesystemOverlay = diff.model as RegionFilesystemOverlay;
    const properties = regionFilesystemOverlay.properties as unknown as IRegionFilesystemOverlayProperties;

    return [`resource.efs-${properties.awsRegionId}-${properties.filesystemName}-filesystem`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model.MODEL_NAME === 'region-filesystem-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const regionFilesystemOverlay = diff.model as RegionFilesystemOverlay;
    const properties = regionFilesystemOverlay.properties as unknown as IRegionFilesystemOverlayProperties;

    // Delete EFS.
    const efs = actionInputs[`resource.efs-${properties.awsRegionId}-${properties.filesystemName}-filesystem`] as Efs;
    efs.markDeleted();

    const output: ActionOutputs = {};
    output[efs.resourceId] = efs;

    return output;
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
