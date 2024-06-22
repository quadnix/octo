import { type UnknownModel } from '../../app.type.js';
import { Container } from '../../decorators/container.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';
import { App } from '../app/app.model.js';
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

    it('should generate add diff of associations on adding subnet', async () => {
      const app = new App('test');
      const region = new Region('region');
      app.addRegion(region);

      const subnet1 = new Subnet(region, 'subnet1');
      region.addSubnet(subnet1);
      const subnet2 = new Subnet(region, 'subnet2');
      region.addSubnet(subnet2);

      const modelSerializationService = await Container.get(ModelSerializationService);
      const app_1 = (await modelSerializationService.deserialize(
        await modelSerializationService.serialize(app),
      )) as App;
      const region_1 = app_1.getChild('region') as Region;
      const subnet2_1 = region_1.getChild('subnet', [{ key: 'subnetName', value: 'subnet2' }]) as Subnet;

      // Update subnet networking rules.
      subnet2.updateNetworkingRules(subnet1, true);

      const diffs = await subnet2.diff(subnet2_1);
      expect(diffs.map((d) => ({ action: d.action, field: d.field, value: (d.value as UnknownModel).getContext() })))
        .toMatchInlineSnapshot(`
       [
         {
           "action": "add",
           "field": "sibling",
           "value": "subnet=region-subnet1,region=region,app=test",
         },
       ]
      `);
    });

    it('should not generate no diff of associations on no change', async () => {
      const app = new App('test');
      const region = new Region('region');
      app.addRegion(region);

      const subnet1 = new Subnet(region, 'subnet1');
      region.addSubnet(subnet1);
      const subnet2 = new Subnet(region, 'subnet2');
      region.addSubnet(subnet2);

      const modelSerializationService = await Container.get(ModelSerializationService);
      const app_1 = (await modelSerializationService.deserialize(
        await modelSerializationService.serialize(app),
      )) as App;
      const region_1 = app_1.getChild('region') as Region;
      const subnet2_1 = region_1.getChild('subnet', [{ key: 'subnetName', value: 'subnet2' }]) as Subnet;

      const diffs = await subnet2.diff(subnet2_1);
      expect(diffs).toMatchInlineSnapshot(`[]`);
    });

    it('should generate delete diff of associations on removing subnet', async () => {
      const app = new App('test');
      const region = new Region('region');
      app.addRegion(region);

      const subnet1 = new Subnet(region, 'subnet1');
      region.addSubnet(subnet1);
      const subnet2 = new Subnet(region, 'subnet2');
      subnet2.updateNetworkingRules(subnet1, true);
      region.addSubnet(subnet2);

      const modelSerializationService = await Container.get(ModelSerializationService);
      const app_1 = (await modelSerializationService.deserialize(
        await modelSerializationService.serialize(app),
      )) as App;
      const region_1 = app_1.getChild('region') as Region;
      const subnet2_1 = region_1.getChild('subnet', [{ key: 'subnetName', value: 'subnet2' }]) as Subnet;

      // Update subnet networking rules.
      subnet2.updateNetworkingRules(subnet1, false);

      const diffs = await subnet2.diff(subnet2_1);
      expect(diffs.map((d) => ({ action: d.action, field: d.field, value: (d.value as UnknownModel).getContext() })))
        .toMatchInlineSnapshot(`
       [
         {
           "action": "delete",
           "field": "sibling",
           "value": "subnet=region-subnet1,region=region,app=test",
         },
       ]
      `);
    });
  });
});
