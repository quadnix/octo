import type { IModelReference, IService } from '@quadnix/octo';
import type { EcrService } from './ecr.service.model.js';

export interface IEcrService extends IService {
  awsRegionIds: EcrService['awsRegionIds'];
  imageName: EcrService['imageName'];
  images: IModelReference[];
}
