import { IImage } from '@quadnix/octo';
import { EcrImage } from './ecr.image.model.js';

export interface IEcrImage extends IImage {
  awsRegionId: EcrImage['awsRegionId'];
}
