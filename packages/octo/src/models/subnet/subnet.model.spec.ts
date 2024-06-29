import { commit, create } from '../../../test/helpers/test-models.js';
import { type Region } from '../region/region.model.js';
import { type Subnet, SubnetType } from './subnet.model.js';

describe('Subnet UT', () => {
  describe('diff()', () => {
    it('should generate update diff when disableSubnetIntraNetwork is changed', async () => {
      const {
        app: [app],
        subnet: [subnet1],
      } = create({ app: ['test'], region: ['region'], subnet: ['subnet1'] });
      subnet1.disableSubnetIntraNetwork = false;

      const app_1 = await commit(app);
      const region_1 = app_1.getChild('region') as Region;
      const subnet1_1 = region_1.getChild('subnet') as Subnet;

      // Update subnet
      subnet1.disableSubnetIntraNetwork = true;

      const diff = await subnet1.diff(subnet1_1);

      expect(diff).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "disableSubnetIntraNetwork",
           "model": "subnet=region-subnet1,region=region,app=test",
           "value": true,
         },
       ]
      `);
    });

    it('should throw error if subnetType is changed', async () => {
      const {
        app: [app],
        subnet: [subnet1],
      } = create({ app: ['test'], region: ['region'], subnet: ['subnet1'] });
      subnet1.subnetType = SubnetType.PUBLIC;

      const app_1 = await commit(app);
      const region_1 = app_1.getChild('region') as Region;
      const subnet1_1 = region_1.getChild('subnet') as Subnet;

      // Update subnet
      subnet1.subnetType = SubnetType.PRIVATE;

      await expect(async () => {
        await subnet1.diff(subnet1_1);
      }).rejects.toThrowErrorMatchingInlineSnapshot('"Change of subnet type is not supported!"');
    });

    it('should generate add diff of associations on adding subnet', async () => {
      const {
        app: [app],
        subnet: [subnet1, subnet2],
      } = create({ app: ['test'], region: ['region'], subnet: ['subnet1', 'subnet2:-1'] });

      const app_1 = await commit(app);
      const region_1 = app_1.getChild('region') as Region;
      const subnet2_1 = region_1.getChild('subnet', [{ key: 'subnetName', value: 'subnet2' }]) as Subnet;

      // Update subnet networking rules.
      subnet2.updateNetworkingRules(subnet1, true);

      const diff = await subnet2.diff(subnet2_1);

      expect(diff).toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "sibling",
           "model": "subnet=region-subnet2,region=region,app=test",
           "value": "subnet=region-subnet1,region=region,app=test",
         },
       ]
      `);
    });

    it('should not generate no diff of associations on no change', async () => {
      const {
        app: [app],
        subnet: [subnet2],
      } = create({ app: ['test'], region: ['region'], subnet: ['subnet1', 'subnet2:-1'] });

      const app_1 = await commit(app);
      const region_1 = app_1.getChild('region') as Region;
      const subnet2_1 = region_1.getChild('subnet', [{ key: 'subnetName', value: 'subnet2' }]) as Subnet;

      const diffs = await subnet2.diff(subnet2_1);
      expect(diffs).toMatchInlineSnapshot(`[]`);
    });

    it('should generate delete diff of associations on removing subnet', async () => {
      const {
        app: [app],
        subnet: [subnet1, subnet2],
      } = create({ app: ['test'], region: ['region'], subnet: ['subnet1', 'subnet2:-1'] });
      subnet2.updateNetworkingRules(subnet1, true);

      const app_1 = await commit(app);
      const region_1 = app_1.getChild('region') as Region;
      const subnet2_1 = region_1.getChild('subnet', [{ key: 'subnetName', value: 'subnet2' }]) as Subnet;

      // Update subnet networking rules.
      subnet2.updateNetworkingRules(subnet1, false);

      const diff = await subnet2.diff(subnet2_1);
      expect(diff).toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "sibling",
           "model": "subnet=region-subnet2,region=region,app=test",
           "value": "subnet=region-subnet1,region=region,app=test",
         },
       ]
      `);
    });
  });
});
