import { create } from '../../../test/helpers/test-models.js';
import { NodeType } from '../../app.type.js';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { ValidationService } from '../../services/validation/validation.service.js';
import type { AModel } from '../model.abstract.js';
import { SubnetType } from './subnet.model.js';

describe('Subnet UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create(
      {
        mocks: [
          {
            type: ValidationService,
            value: ValidationService.getInstance(),
          },
        ],
      },
      { factoryTimeoutInMs: 500 },
    );
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  it('should set static members', () => {
    const {
      subnet: [subnet],
    } = create({ app: ['test'], region: ['region'], subnet: ['public'] });

    expect((subnet.constructor as typeof AModel).NODE_NAME).toBe('subnet');
    expect((subnet.constructor as typeof AModel).NODE_PACKAGE).toBe('@octo');
    expect((subnet.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  it('should set subnetId and options', () => {
    const {
      subnet: [subnet],
    } = create({ app: ['test'], region: ['region'], subnet: ['public'] });
    subnet.subnetType = SubnetType.PUBLIC;

    expect(subnet.subnetId).toBe('region-public');
    expect(subnet.disableSubnetIntraNetwork).toBeFalsy();
    expect(subnet.subnetType).toBe(SubnetType.PUBLIC);
  });

  describe('validation', () => {
    it('should validate subnetName', async () => {
      create({ app: ['test'], region: ['region'], subnet: ['$$'] });

      const validationService = await container.get(ValidationService);
      const result = validationService.validate();

      expect(result.pass).toBeFalsy();
    });
  });

  describe('updateNetworkingRules()', () => {
    it('should add and remove another subnet as sibling', () => {
      const {
        subnet: [privateSubnet, publicSubnet],
      } = create({ app: ['test'], region: ['region'], subnet: ['private', 'public:-1'] });

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
      } = create({ app: ['test'], region: ['region'], subnet: ['private', 'public:-1'] });

      privateSubnet.updateNetworkingRules(publicSubnet, true);
      privateSubnet.updateNetworkingRules(publicSubnet, true);

      expect(privateSubnet.getSiblings()['subnet'].length).toBe(1);
      expect(publicSubnet.getSiblings()['subnet'].length).toBe(1);
    });
  });
});
