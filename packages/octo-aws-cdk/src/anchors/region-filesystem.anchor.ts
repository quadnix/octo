import { AAnchor, Anchor, type IAnchor, type UnknownModel } from '@quadnix/octo';
import type { AwsRegion } from '../models/region/aws.region.model.js';

interface IRegionFilesystemAnchor extends IAnchor {
  filesystemName: string;
}

@Anchor()
export class RegionFilesystemAnchor extends AAnchor {
  readonly filesystemName: string;

  constructor(anchorId: string, filesystemName: string, parent: AwsRegion) {
    super(anchorId, parent);
    this.filesystemName = filesystemName;
  }

  override synth(): IRegionFilesystemAnchor {
    return {
      anchorId: this.anchorId,
      filesystemName: this.filesystemName,
      parent: { context: this.getParent().getContext() },
    };
  }

  override toJSON(): object {
    return {
      anchorId: this.anchorId,
      filesystemName: this.filesystemName,
      parent: this.getParent().getContext(),
    };
  }

  static override async unSynth(
    deserializationClass: typeof RegionFilesystemAnchor,
    anchor: IRegionFilesystemAnchor,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<RegionFilesystemAnchor> {
    const parent = (await deReferenceContext(anchor.parent.context)) as AwsRegion;
    const newAnchor = parent.getAnchor(anchor.anchorId) as RegionFilesystemAnchor;
    if (!newAnchor) {
      return new deserializationClass(anchor.anchorId, anchor.filesystemName, parent);
    }
    return newAnchor;
  }
}
