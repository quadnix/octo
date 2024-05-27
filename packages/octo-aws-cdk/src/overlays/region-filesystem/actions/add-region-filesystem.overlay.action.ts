import { Action, ActionOutputs, Diff, DiffAction, Factory, IModelAction, ModelType } from '@quadnix/octo';
import { Efs } from '../../../resources/efs/efs.resource.js';
import { IRegionFilesystemOverlayProperties } from '../region-filesystem.overlay.interface.js';
import { RegionFilesystemOverlay } from '../region-filesystem.overlay.js';

@Action(ModelType.OVERLAY)
export class AddRegionFilesystemOverlayAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddRegionFilesystemOverlayAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model.MODEL_NAME === 'region-filesystem-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(diff: Diff): Promise<ActionOutputs> {
    const regionFilesystemOverlay = diff.model as RegionFilesystemOverlay;
    const properties = regionFilesystemOverlay.properties as unknown as IRegionFilesystemOverlayProperties;

    // Create EFS.
    const efs = new Efs(
      `efs-${properties.awsRegionId}-${properties.filesystemName}-filesystem`,
      { awsRegionId: properties.awsRegionId },
      [],
    );

    const output: ActionOutputs = {};
    output[efs.resourceId] = efs;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddRegionFilesystemOverlayAction>(AddRegionFilesystemOverlayAction)
export class AddRegionFilesystemOverlayActionFactory {
  static async create(): Promise<AddRegionFilesystemOverlayAction> {
    return new AddRegionFilesystemOverlayAction();
  }
}