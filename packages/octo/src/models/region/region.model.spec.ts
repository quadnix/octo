import { NodeType } from '../../app.type.js';
import { DependencyRelationship } from '../../functions/dependency/dependency.js';
import { getSchemaInstance } from '../../functions/schema/schema.js';
import { create } from '../../utilities/test-helpers/test-models.js';
import type { AModel } from '../model.abstract.js';
import { RegionSchema } from './region.schema.js';

describe('Region UT', () => {
  it('should set static members', () => {
    const {
      region: [region],
    } = create({ account: ['aws,account'], app: ['test'], region: ['region-1'] });

    expect((region.constructor as typeof AModel).NODE_NAME).toBe('region');
    expect((region.constructor as typeof AModel).NODE_PACKAGE).toBe('@octo');
    expect((region.constructor as typeof AModel).NODE_SCHEMA).toBe(RegionSchema);
    expect((region.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  describe('schema validation', () => {
    it('should validate regionId', async () => {
      const {
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], region: ['$$'] });

      expect(() => {
        getSchemaInstance<RegionSchema>(RegionSchema, region.synth());
      }).toThrow('Property "regionId" in schema could not be validated!');
    });
  });

  describe('addEnvironment()', () => {
    it('should throw error if duplicate environments exist', () => {
      expect(() => {
        create({ account: ['aws,account'], app: ['test'], environment: ['qa', 'qa:-1'], region: ['region-1'] });
      }).toThrow('Environment already exists!');
    });

    it('should add environment as a child', () => {
      const {
        environment: [environment],
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], environment: ['qa'], region: ['region-1'] });

      expect(region.getDependencyIndex(environment, DependencyRelationship.PARENT)).toBeGreaterThan(-1);
      expect(environment.getDependencyIndex(region, DependencyRelationship.CHILD)).toBeGreaterThan(-1);
    });
  });

  describe('addFilesystem()', () => {
    it('should throw error if duplicate filesystems exist', () => {
      expect(() => {
        create({ account: ['aws,account'], app: ['test'], filesystem: ['fs', 'fs:-1'], region: ['region-1'] });
      }).toThrow('Filesystem already exists!');
    });

    it('should add filesystem as a child', () => {
      const {
        filesystem: [filesystem],
        region: [region],
      } = create({ account: ['aws,account'], app: ['test'], filesystem: ['fs'], region: ['region-1'] });

      expect(region.getDependencyIndex(filesystem, DependencyRelationship.PARENT)).toBeGreaterThan(-1);
      expect(filesystem.getDependencyIndex(region, DependencyRelationship.CHILD)).toBeGreaterThan(-1);
    });
  });

  describe('addSubnet()', () => {
    it('should throw error if duplicate subnets exist', () => {
      expect(() => {
        create({ account: ['aws,account'], app: ['test'], region: ['region-1'], subnet: ['public', 'public:-1'] });
      }).toThrow('Subnet already exists!');
    });

    it('should add subnet as a child', () => {
      const {
        region: [region],
        subnet: [subnet],
      } = create({ account: ['aws,account'], app: ['test'], region: ['region-1'], subnet: ['public'] });

      expect(region.getDependencyIndex(subnet, DependencyRelationship.PARENT)).toBeGreaterThan(-1);
      expect(subnet.getDependencyIndex(region, DependencyRelationship.CHILD)).toBeGreaterThan(-1);
    });
  });
});
