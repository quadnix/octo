import { AAnchor, Anchor, type IAnchor, ModifyInterface } from '@quadnix/octo';
import type { AwsFilesystem } from '../models/filesystem/aws.filesystem.model.js';

interface IFilesystemAnchorProperties
  extends ModifyInterface<
    IAnchor['properties'],
    {
      awsRegionId: string;
      filesystemName: string;
      regionId: string;
    }
  > {}

@Anchor('@octo')
export class FilesystemAnchor extends AAnchor {
  declare properties: IFilesystemAnchorProperties;

  constructor(anchorId: string, properties: IFilesystemAnchorProperties, parent: AwsFilesystem) {
    super(anchorId, properties, parent);
  }
}
