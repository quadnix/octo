import { NodeType } from '../../app.type.js';
import { getSchemaInstance } from '../../functions/schema/schema.js';
import { create } from '../../utilities/test-helpers/test-models.js';
import type { AModel } from '../model.abstract.js';
import { Region } from '../region/region.model.js';
import { Service } from './service.model.js';
import { ServiceSchema, ServiceType } from './service.schema.js';

describe('Service UT', () => {
  it('should set static members', () => {
    const {
      app: [app],
    } = create({ app: ['test'] });
    const service = new Service('table', [app], ServiceType.OTHER, 'test');

    expect((service.constructor as typeof AModel).NODE_NAME).toBe('service');
    expect((service.constructor as typeof AModel).NODE_PACKAGE).toBe('@octo');
    expect((service.constructor as typeof AModel).NODE_SCHEMA).toBe(ServiceSchema);
    expect((service.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  describe('schema validation', () => {
    it('should validate label', () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const service = new Service('table', [app], ServiceType.DATABASE, '$$');

      expect(() => {
        getSchemaInstance<ServiceSchema>(ServiceSchema, service.synth());
      }).toThrow('Property "label" in schema could not be validated!');
    });

    it('should validate type', () => {
      const {
        app: [app],
      } = create({ app: ['test'] });
      const service = new Service('table', [app], 'unknown' as ServiceType, 'dynamodb');

      expect(() => {
        getSchemaInstance<ServiceSchema>(ServiceSchema, service.synth());
      }).toThrow('Property "type" in schema could not be validated!');
    });
  });

  describe('constructor()', () => {
    it('should throw error if no parent is given', () => {
      expect(() => {
        new Service('table', [], ServiceType.OTHER, 'test');
      }).toThrow('Service must have at least one parent!');
    });

    it('should throw error if a parent is not attached to the graph', () => {
      expect(() => {
        new Service('table', [new Region('region')], ServiceType.OTHER, 'test');
      }).toThrow('Service parent must be attached to the graph!');
    });

    it('should throw error if a parent already has a service with the same ID', () => {
      const {
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region'] });
      new Service('table', [region], ServiceType.OTHER, 'test');

      expect(() => {
        new Service('table', [region], ServiceType.OTHER, 'test');
      }).toThrow('Service already exists!');
    });

    it('should allow the same ID under different parents', () => {
      const {
        region: [region1, region2],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region-1', 'region-2:-1'] });
      const service1 = new Service('table', [region1], ServiceType.OTHER, 'test');
      const service2 = new Service('table', [region2], ServiceType.OTHER, 'test');

      expect(service1.getContext()).not.toBe(service2.getContext());
    });

    it('should attach under a region', () => {
      const {
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region'] });
      const service = new Service('table', [region], ServiceType.OTHER, 'test');

      expect(service.getParents()['region'].map((d) => d.to)).toEqual([region]);
      expect(region.getChildren('service')['service'].map((d) => d.to)).toEqual([service]);
      expect(service.getContext()).toBe('service=table,region=region,account=account,app=test');
    });

    it('should attach under two subnets', () => {
      const {
        subnet: [subnet1, subnet2],
      } = create({
        account: ['aws,account'],
        app: ['test'],
        region: ['region'],
        subnet: ['public-1', 'public-2:-1'],
      });
      const service = new Service('alb', [subnet1, subnet2], ServiceType.OTHER, 'test');

      expect(service.getParents()['subnet'].map((d) => d.to)).toEqual([subnet1, subnet2]);
      expect(service.getContext()).toBe(
        [
          'service=alb',
          'subnet=region-public-1,region=region,account=account,app=test',
          'subnet=region-public-2,region=region,account=account,app=test',
        ].join(','),
      );
    });

    it('should attach under another service', () => {
      const {
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region'] });
      const zone = new Service('zone', [region], ServiceType.OTHER, 'test');
      const domain = new Service('domain', [zone], ServiceType.OTHER, 'test');

      expect(domain.getParents()['service'].map((d) => d.to)).toEqual([zone]);
      expect(domain.getContext()).toBe('service=domain,service=zone,region=region,account=account,app=test');
    });

    it('should build the same context whatever order the parents are given in', () => {
      const {
        subnet: [subnet1, subnet2],
      } = create({
        account: ['aws,account'],
        app: ['test'],
        region: ['region'],
        subnet: ['public-1', 'public-2:-1'],
      });
      const {
        subnet: [otherSubnet1, otherSubnet2],
      } = create({
        account: ['aws,account'],
        app: ['test'],
        region: ['region'],
        subnet: ['public-1', 'public-2:-1'],
      });

      const service = new Service('alb', [subnet1, subnet2], ServiceType.OTHER, 'test');
      const otherService = new Service('alb', [otherSubnet2, otherSubnet1], ServiceType.OTHER, 'test');

      expect(otherService.getContext()).toBe(service.getContext());
    });

    it('should not freeze the context before every parent is attached', () => {
      const {
        subnet: [subnet1, subnet2],
      } = create({
        account: ['aws,account'],
        app: ['test'],
        region: ['region'],
        subnet: ['public-1', 'public-2:-1'],
      });
      // A child already on the second parent makes attaching to it read the service's context.
      new Service('existing', [subnet2], ServiceType.OTHER, 'test');

      const service = new Service('alb', [subnet1, subnet2], ServiceType.OTHER, 'test');

      expect(service.getContext()).toContain('subnet=region-public-1');
      expect(service.getContext()).toContain('subnet=region-public-2');
    });
  });

  describe('synth()', () => {
    it('should synth parents in context order, with type and label', () => {
      const {
        subnet: [subnet1, subnet2],
      } = create({
        account: ['aws,account'],
        app: ['test'],
        region: ['region'],
        subnet: ['public-1', 'public-2:-1'],
      });
      const service = new Service('alb', [subnet2, subnet1], ServiceType.LOAD_BALANCER, 'alb');

      expect(service.synth()).toEqual({
        label: 'alb',
        parents: [
          { context: 'subnet=region-public-1,region=region,account=account,app=test' },
          { context: 'subnet=region-public-2,region=region,account=account,app=test' },
        ],
        serviceId: 'alb',
        type: 'load-balancer',
      });
    });
  });
});
