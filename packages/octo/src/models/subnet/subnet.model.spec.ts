import { Region } from '../region/region.model.js';
import { Subnet, SubnetType } from './subnet.model.js';

describe('Subnet UT', () => {
  describe('diff()', () => {
    it('should generate update diff when disableSubnetIntraNetwork is changed', async () => {
      const region = new Region('region');
      const subnet_1 = new Subnet(region, 'subnet');
      subnet_1.disableSubnetIntraNetwork = false;

      const subnet = new Subnet(region, 'subnet');
      subnet.disableSubnetIntraNetwork = true;

      const diff = await subnet.diff(subnet_1);
      expect(diff).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "disableSubnetIntraNetwork",
           "value": true,
         },
       ]
      `);
    });

    it('should throw error if subnetType is changed', async () => {
      const region = new Region('region');
      const subnet_1 = new Subnet(region, 'subnet');
      subnet_1.subnetType = SubnetType.PUBLIC;

      const subnet = new Subnet(region, 'subnet');
      subnet.subnetType = SubnetType.PRIVATE;

      await expect(async () => {
        await subnet.diff(subnet_1);
      }).rejects.toThrowErrorMatchingInlineSnapshot('"Change of subnet type is not supported!"');
    });

    it('should generate update diff of associations on adding subnet', async () => {
      const region = new Region('region');
      const subnet1 = new Subnet(region, 'subnet1');

      const subnet2_1 = new Subnet(region, 'subnet2');

      const subnet2 = new Subnet(region, 'subnet2');
      subnet2.updateNetworkingRules(subnet1, true);

      const diff = await subnet2.diff(subnet2_1);
      expect(diff).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "association",
           "value": "region-subnet1",
         },
       ]
      `);
    });

    it('should not generate update diff of associations on no change', async () => {
      const region = new Region('region');
      const subnet1 = new Subnet(region, 'subnet1');

      const subnet2_1 = new Subnet(region, 'subnet2');
      subnet2_1.updateNetworkingRules(subnet1, true);

      const subnet2 = new Subnet(region, 'subnet2');
      subnet2.updateNetworkingRules(subnet1, true);

      const diff = await subnet2.diff(subnet2_1);
      expect(diff).toMatchInlineSnapshot(`[]`);
    });

    it('should generate update diff of associations on removing subnet', async () => {
      const region = new Region('region');
      const subnet1 = new Subnet(region, 'subnet1');

      const subnet2_1 = new Subnet(region, 'subnet2');
      subnet2_1.updateNetworkingRules(subnet1, true);

      const subnet2 = new Subnet(region, 'subnet2');

      const diff = await subnet2.diff(subnet2_1);
      expect(diff).toMatchInlineSnapshot(`
       [
         {
           "action": "update",
           "field": "association",
           "value": "region-subnet1",
         },
       ]
      `);
    });
  });
});
