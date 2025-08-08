import { Image, Model } from '@quadnix/octo';
import { AwsEcrImageSchema } from './aws-ecr-image.schema.js';

/**
 * @internal
 */
@Model<AwsEcrImage>('@octo', 'image', AwsEcrImageSchema)
export class AwsEcrImage extends Image {
  static override async unSynth(image: AwsEcrImageSchema): Promise<AwsEcrImage> {
    return new AwsEcrImage(image.imageFamily, image.imageName);
  }
}
