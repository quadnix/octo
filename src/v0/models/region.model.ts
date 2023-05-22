export type IRegionId = 'aws-us-east-1' | 'aws-ap-south-1';

export class Region {
  regionId: IRegionId;

  constructor(regionId: IRegionId) {
    this.regionId = regionId;
  }
}
