import { AwsSingleAzRegion, AwsSingleAzRegionId } from './aws-single-az-region.model.js';

describe('AwsSingleAzRegion UT', () => {
  describe('unSynth()', () => {
    it('should reload a region with the AWS region and availability zone it was created with', async () => {
      const region = new AwsSingleAzRegion('my-region', AwsSingleAzRegionId.AWS_US_EAST_1A);

      const reloaded = await AwsSingleAzRegion.unSynth(region.synth());

      expect(reloaded.synth()).toEqual({
        awsRegionAZs: ['us-east-1a'],
        awsRegionId: 'us-east-1',
        regionId: 'my-region',
      });
    });
  });
});
