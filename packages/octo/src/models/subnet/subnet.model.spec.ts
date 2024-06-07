import { Container } from '../../decorators/container.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';
import { App } from '../app/app.model.js';
import { Region } from '../region/region.model.js';
import { Subnet, SubnetType } from './subnet.model.js';

describe('Subnet UT', () => {
  describe('diff()', () => {
    let modelSerializationService: ModelSerializationService;

    beforeAll(async () => {
      modelSerializationService = await Container.get(ModelSerializationService);
    });

    it('should generate update diff when disableSubnetIntraNetwork is changed', async () => {
      const region = new Region('region');
      const subnet1_1 = new Subnet(region, 'subnet');
      subnet1_1.disableSubnetIntraNetwork = false;
      const subnet1_2 = new Subnet(region, 'subnet');
      subnet1_2.disableSubnetIntraNetwork = true;

      const diff = await subnet1_2.diff(subnet1_1);
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
      const subnet1_1 = new Subnet(region, 'subnet');
      subnet1_1.subnetType = SubnetType.PUBLIC;
      const subnet2_1 = new Subnet(region, 'subnet');
      subnet2_1.subnetType = SubnetType.PRIVATE;

      await expect(async () => {
        await subnet2_1.diff(subnet1_1);
      }).rejects.toThrowErrorMatchingInlineSnapshot('"Change of subnet type is not supported!"');
    });

    it('should generate update diff of associations on adding subnet', async () => {
      const app = new App('test');
      const region = new Region('region');
      app.addRegion(region);
      const subnet1 = new Subnet(region, 'subnet1');
      region.addSubnet(subnet1);
      const subnet2 = new Subnet(region, 'subnet2');
      region.addSubnet(subnet2);

      subnet2.updateNetworkingRules(subnet1, true);

      const diff = await subnet2.diff();
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
      const app = new App('test');
      const region = new Region('region');
      app.addRegion(region);
      const subnet1 = new Subnet(region, 'subnet1');
      region.addSubnet(subnet1);
      const subnet2 = new Subnet(region, 'subnet2');
      region.addSubnet(subnet2);

      subnet2.updateNetworkingRules(subnet1, true);

      const diff = await subnet2.diff(subnet2);
      expect(diff).toMatchInlineSnapshot(`[]`);
    });

    it('should generate update diff of associations on removing subnet', async () => {
      const app = new App('test');
      const region = new Region('region');
      app.addRegion(region);
      const subnet1 = new Subnet(region, 'subnet1');
      region.addSubnet(subnet1);
      const subnet2 = new Subnet(region, 'subnet2');
      region.addSubnet(subnet2);

      subnet2.updateNetworkingRules(subnet1, true);

      const subnet2_1 = (await modelSerializationService.deserialize(
        await modelSerializationService.serialize(subnet2),
      )) as Subnet;
      subnet2.updateNetworkingRules(subnet1, false);

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
