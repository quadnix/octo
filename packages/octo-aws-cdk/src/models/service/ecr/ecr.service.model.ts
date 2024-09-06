import { Image, Model, ModelError, Service, type UnknownModel } from '@quadnix/octo';
import { AwsRegion, RegionId } from '../../region/aws.region.model.js';
import type { IEcrService } from './ecr.service.interface.js';

@Model()
export class EcrService extends Service {
  readonly awsRegionIds: string[] = [];

  readonly imageName: string;

  readonly images: Image[] = [];

  constructor(imageName: string) {
    super(`${imageName}-ecr`);
    this.imageName = imageName;
  }

  addImage(image: Image): void {
    if (this.awsRegionIds.length === 0) {
      throw new ModelError('This service has not been configured with a region yet! Please add a region first.', this);
    }
    if (this.imageName !== image.imageName) {
      throw new ModelError('Invalid image! This ECR container is not for the given image.', this);
    }

    if (!this.images.find((i) => i.imageTag === image.imageTag)) {
      this.images.push(image);
    }
  }

  addRegion(regionId: RegionId): void {
    const awsRegionId = AwsRegion.getRegionIdParts(regionId).awsRegionId;
    if (!this.awsRegionIds.includes(awsRegionId)) {
      this.awsRegionIds.push(awsRegionId);
    }
  }

  override synth(): IEcrService {
    return {
      awsRegionIds: [...this.awsRegionIds],
      imageName: this.imageName,
      images: this.images.map((i) => ({ context: i.getContext() })),
      serviceId: `${this.imageName}-ecr`,
    };
  }

  static override async unSynth(
    ecrService: IEcrService,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<EcrService> {
    const promiseToGetImages = ecrService.images.map((i) => deReferenceContext(i.context));
    const images = (await Promise.all(promiseToGetImages)) as Image[];

    const newEcrService = new EcrService(ecrService.imageName);
    newEcrService.awsRegionIds.push(...ecrService.awsRegionIds);
    newEcrService.images.push(...images);
    return newEcrService;
  }
}
