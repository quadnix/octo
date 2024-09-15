import { create } from '../../../test/helpers/test-models.js';
import { NodeType } from '../../app.type.js';
import { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { DependencyRelationship } from '../../functions/dependency/dependency.js';
import { ValidationService } from '../../services/validation/validation.service.js';
import type { AModel } from '../model.abstract.js';
import { Region } from './region.model.js';

describe('Region UT', () => {
  beforeEach(() => {
    TestContainer.create(
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

  afterEach(() => {
    Container.reset();
  });

  it('should set static members', () => {
    const region = new Region('region');

    expect((region.constructor as typeof AModel).NODE_NAME).toBe('region');
    expect((region.constructor as typeof AModel).NODE_PACKAGE).toBe('@octo');
    expect((region.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  describe('validation', () => {
    it('should validate regionId', async () => {
      new Region('$$');

      const validationService = await Container.get(ValidationService);
      const result = validationService.validate();

      expect(result.pass).toBeFalsy();
    });
  });

  describe('addEnvironment()', () => {
    it('should throw error if duplicate environments exist', () => {
      expect(() => {
        create({ app: ['test'], environment: ['qa', 'qa:-1'], region: ['region-1'] });
      }).toThrow('Environment already exists!');
    });

    it('should add environment as a child', () => {
      const {
        environment: [environment],
        region: [region],
      } = create({ app: ['test'], environment: ['qa'], region: ['region-1'] });

      expect(region.getDependencyIndex(environment, DependencyRelationship.PARENT)).toBeGreaterThan(-1);
      expect(environment.getDependencyIndex(region, DependencyRelationship.CHILD)).toBeGreaterThan(-1);
    });
  });

  describe('addSubnet()', () => {
    it('should throw error if duplicate subnets exist', () => {
      expect(() => {
        create({ app: ['test'], region: ['region-1'], subnet: ['public', 'public:-1'] });
      }).toThrow('Subnet already exists!');
    });

    it('should add subnet as a child', () => {
      const {
        region: [region],
        subnet: [subnet],
      } = create({ app: ['test'], region: ['region-1'], subnet: ['public'] });

      expect(region.getDependencyIndex(subnet, DependencyRelationship.PARENT)).toBeGreaterThan(-1);
      expect(subnet.getDependencyIndex(region, DependencyRelationship.CHILD)).toBeGreaterThan(-1);
    });
  });
});
