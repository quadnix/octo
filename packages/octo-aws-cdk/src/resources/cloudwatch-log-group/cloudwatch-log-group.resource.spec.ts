import { CloudWatchLogGroup } from './cloudwatch-log-group.resource.js';

function createCloudWatchLogGroup(overrides: Partial<CloudWatchLogGroup['properties']> = {}): CloudWatchLogGroup {
  return new CloudWatchLogGroup('cloudwatch-log-group-checkout', {
    awsAccountId: '123456789012',
    awsRegionId: 'us-east-1',
    logGroupName: '/aws/lambda/checkout',
    retentionInDays: 30,
    ...overrides,
  });
}

describe('CloudWatchLogGroup UT', () => {
  describe('diffProperties()', () => {
    it('should report nothing when nothing moved', async () => {
      expect(await createCloudWatchLogGroup().diffProperties(createCloudWatchLogGroup())).toEqual([]);
    });

    it('should replace when the name changes', async () => {
      const diffs = await createCloudWatchLogGroup({ logGroupName: '/aws/lambda/cart' }).diffProperties(
        createCloudWatchLogGroup(),
      );

      expect(diffs.map((d) => `${d.action} ${d.field}`)).toEqual(['replace resourceId']);
    });

    it('should update in place when the retention changes', async () => {
      const diffs = await createCloudWatchLogGroup({ retentionInDays: 90 }).diffProperties(createCloudWatchLogGroup());

      expect(diffs.map((d) => `${d.action} ${d.field}`)).toEqual(['update properties']);
    });
  });
});
