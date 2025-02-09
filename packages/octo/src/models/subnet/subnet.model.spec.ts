import { create } from '../../utilities/test-helpers/test-models.js';
import { NodeType } from '../../app.type.js';
import { getSchemaInstance } from '../../functions/schema/schema.js';
import type { AModel } from '../model.abstract.js';
import { SubnetSchema, SubnetType } from './subnet.schema.js';

describe('Subnet UT', () => {
  it('should set static members', () => {
    const {
      subnet: [subnet],
    } = create({ account: ['aws,account'], app: ['test'], region: ['region'], subnet: ['public'] });

    expect((subnet.constructor as typeof AModel).NODE_NAME).toBe('subnet');
    expect((subnet.constructor as typeof AModel).NODE_PACKAGE).toBe('@octo');
    expect((subnet.constructor as typeof AModel).NODE_SCHEMA).toBe(SubnetSchema);
    expect((subnet.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  it('should set subnetId and options', () => {
    const {
      subnet: [subnet],
    } = create({ account: ['aws,account'], app: ['test'], region: ['region'], subnet: ['public'] });
    subnet.subnetType = SubnetType.PUBLIC;

    expect(subnet.subnetId).toBe('region-public');
    expect(subnet.disableSubnetIntraNetwork).toBeFalsy();
    expect(subnet.subnetType).toBe(SubnetType.PUBLIC);
  });

  describe('schema validation', () => {
    it('should validate subnetName', async () => {
      const {
        subnet: [subnet],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region'], subnet: ['$$'] });

      expect(() => {
        getSchemaInstance<SubnetSchema>(SubnetSchema, subnet.synth());
      }).toThrow('Property "subnetName" in schema could not be validated!');
    });
  });

  describe('updateNetworkingRules()', () => {
    it('should add and remove another subnet as sibling', () => {
      const {
        subnet: [privateSubnet, publicSubnet],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region'], subnet: ['private', 'public:-1'] });

      privateSubnet.updateNetworkingRules(publicSubnet, true);

      expect(privateSubnet.getSiblings()['subnet'].length).toBe(1);
      expect(publicSubnet.getSiblings()['subnet'].length).toBe(1);

      privateSubnet.updateNetworkingRules(publicSubnet, false);

      expect(privateSubnet.getSiblings()['subnet']).toBeUndefined();
      expect(publicSubnet.getSiblings()['subnet']).toBeUndefined();
    });

    it('should not add same sibling twice', () => {
      const {
        subnet: [privateSubnet, publicSubnet],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region'], subnet: ['private', 'public:-1'] });

      privateSubnet.updateNetworkingRules(publicSubnet, true);
      privateSubnet.updateNetworkingRules(publicSubnet, true);

      expect(privateSubnet.getSiblings()['subnet'].length).toBe(1);
      expect(publicSubnet.getSiblings()['subnet'].length).toBe(1);
    });
  });
});
