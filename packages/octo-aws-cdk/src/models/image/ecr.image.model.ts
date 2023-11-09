import { IImageDockerOptions, Image, Model } from '@quadnix/octo';
import { IEcrImage } from './ecr.image.interface.js';

@Model()
export class EcrImage extends Image {
  readonly awsRegionId: string;

  constructor(awsRegionId: string, imageName: string, imageTag: string, options: IImageDockerOptions) {
    super(imageName, imageTag, options);

    this.awsRegionId = awsRegionId;
  }

  override synth(): IEcrImage {
    return { ...super.synth(), awsRegionId: this.awsRegionId };
  }

  static override async unSynth(ecrImage: IEcrImage): Promise<EcrImage> {
    return new EcrImage(ecrImage.awsRegionId, ecrImage.imageName, ecrImage.imageTag, {
      ...ecrImage.dockerOptions,
    });
  }
}
