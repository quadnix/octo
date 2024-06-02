import { AAnchor, Anchor, IAnchor, UnknownModel } from '@quadnix/octo';
import { AwsSubnet } from '../models/subnet/aws.subnet.model.js';

interface ISubnetFilesystemMountAnchor extends IAnchor {
  filesystemName: string;
}

@Anchor()
export class SubnetFilesystemMountAnchor extends AAnchor {
  readonly filesystemName: string;

  constructor(anchorId: string, filesystemName: string, parent: AwsSubnet) {
    super(anchorId, parent);
    this.filesystemName = filesystemName;
  }

  override synth(): ISubnetFilesystemMountAnchor {
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
    deserializationClass: typeof SubnetFilesystemMountAnchor,
    anchor: ISubnetFilesystemMountAnchor,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<SubnetFilesystemMountAnchor> {
    const parent = (await deReferenceContext(anchor.parent.context)) as AwsSubnet;
    const newAnchor = parent.getAnchor(anchor.anchorId) as SubnetFilesystemMountAnchor;
    if (!newAnchor) {
      return new deserializationClass(anchor.anchorId, anchor.filesystemName, parent);
    }
    return newAnchor;
  }
}
