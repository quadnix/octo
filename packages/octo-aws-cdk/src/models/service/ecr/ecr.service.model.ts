import { Diff, DiffAction, Image, Model, Service, type UnknownModel } from '@quadnix/octo';
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
      throw new Error('This service has not been configured with a region yet! Please add a region first.');
    }
    if (this.imageName !== image.imageName) {
      throw new Error('Invalid image! This ECR container is not for the given image.');
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

  override async diffProperties(previous: EcrService): Promise<Diff[]> {
    const diffs: Diff[] = [];

    for (const awsRegionId of previous.awsRegionIds) {
      if (!this.awsRegionIds.includes(awsRegionId)) {
        // Delete all images from this region.
        for (const image of previous.images) {
          diffs.push(new Diff(previous, DiffAction.DELETE, 'images', { awsRegionId, image }));
        }
      }
    }
    for (const awsRegionId of this.awsRegionIds) {
      if (!previous.awsRegionIds.includes(awsRegionId)) {
        // Add all images to this region.
        for (const image of this.images) {
          diffs.push(new Diff(this, DiffAction.ADD, 'images', { awsRegionId, image }));
        }
      }
    }

    for (const image of previous.images) {
      if (!this.images.find((i) => i.imageId === image.imageId)) {
        // Delete image from all the regions.
        for (const awsRegionId of previous.awsRegionIds) {
          diffs.push(new Diff(previous, DiffAction.DELETE, 'images', { awsRegionId, image }));
        }
      }
    }
    for (const image of this.images) {
      if (!previous.images.find((i) => i.imageId === image.imageId)) {
        // Add image to all the regions.
        for (const awsRegionId of this.awsRegionIds) {
          diffs.push(new Diff(this, DiffAction.ADD, 'images', { awsRegionId, image }));
        }
      }
    }

    return diffs;
  }

  removeImage(imageName: Image['imageName'], imageTag: Image['imageTag']): void {
    if (this.imageName !== imageName) {
      throw new Error('Invalid image! This ECR container is not for the given image.');
    }

    const imageIndex = this.images.findIndex((i) => i.imageTag === imageTag);
    if (imageIndex > -1) {
      this.images.splice(imageIndex, 1);
    }
  }

  removeRegion(regionId: RegionId): void {
    const awsRegionIdToBeRemoved = AwsRegion.getRegionIdParts(regionId).awsRegionId;

    const regionIndex = this.awsRegionIds.findIndex((awsRegionId) => awsRegionId === awsRegionIdToBeRemoved);
    if (regionIndex > -1) {
      this.awsRegionIds.splice(regionIndex, 1);
    }

    if (this.awsRegionIds.length === 0) {
      for (const image of this.images) {
        this.removeImage(image.imageName, image.imageTag);
      }
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
