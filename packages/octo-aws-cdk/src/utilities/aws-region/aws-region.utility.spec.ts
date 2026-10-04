import { AwsRegionUtility } from './aws-region.utility.js';

describe('AwsRegionUtility UT', () => {
  describe('getRegionIdParts()', () => {
    it('should split a region id into its availability zone and AWS region', () => {
      expect(AwsRegionUtility.getRegionIdParts('aws-us-east-1a')).toEqual({
        awsRegionAZ: 'us-east-1a',
        awsRegionId: 'us-east-1',
      });
    });
  });
});
