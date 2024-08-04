import { type IImageDockerOptions, Image, Model } from '@quadnix/octo';
import { IAwsImage } from './aws.image.interface.js';

@Model()
export class AwsImage extends Image {
  constructor(imageName: string, imageTag: string, options: IImageDockerOptions) {
    super(imageName, imageTag, options);
  }

  static override async unSynth(image: IAwsImage): Promise<AwsImage> {
    return new AwsImage(image.imageName, image.imageTag, {
      ...image.dockerOptions,
    });
  }
}
