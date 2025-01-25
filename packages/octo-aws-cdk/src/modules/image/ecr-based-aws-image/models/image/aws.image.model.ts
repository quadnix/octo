import { Image, Model } from '@quadnix/octo';
import { AwsImageSchema } from './aws.image.schema.js';

@Model<AwsImage>('@octo', 'image', AwsImageSchema)
export class AwsImage extends Image {
  static override async unSynth(awsImage: AwsImageSchema): Promise<AwsImage> {
    return new AwsImage(awsImage.imageFamily, awsImage.imageName);
  }
}
