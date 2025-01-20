import { create } from '../../utilities/test-helpers/test-models.js';
import { NodeType } from '../../app.type.js';
import { DependencyRelationship } from '../../functions/dependency/dependency.js';
import { getSchemaInstance } from '../../functions/schema/schema.js';
import type { AModel } from '../model.abstract.js';
import { ServerSchema } from './server.schema.js';

describe('Server UT', () => {
  it('should set static members', () => {
    const {
      server: [server],
    } = create({ account: ['aws,account'], app: ['test'], server: ['backend'] });

    expect((server.constructor as typeof AModel).NODE_NAME).toBe('server');
    expect((server.constructor as typeof AModel).NODE_PACKAGE).toBe('@octo');
    expect((server.constructor as typeof AModel).NODE_SCHEMA).toBe(ServerSchema);
    expect((server.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  describe('schema validation', () => {
    it('should validate serverKey', async () => {
      const {
        server: [server],
      } = create({ account: ['aws,account'], app: ['test'], server: ['$$'] });

      expect(() => {
        getSchemaInstance<ServerSchema>(ServerSchema, server.synth());
      }).toThrow('Validation error!');
    });
  });

  describe('addDeployment()', () => {
    it('should throw error if duplicate deployment exist', () => {
      expect(() => {
        create({ account: ['aws,account'], app: ['test'], deployment: ['0.0.1', '0.0.1:-1'], server: ['backend'] });
      }).toThrow('Deployment already exists!');
    });

    it('should add deployment as a child', () => {
      const {
        deployment: [deployment],
        server: [server],
      } = create({ account: ['aws,account'], app: ['test'], deployment: ['0.0.1'], server: ['backend'] });

      expect(server.getDependencyIndex(deployment, DependencyRelationship.PARENT)).toBeGreaterThan(-1);
      expect(deployment.getDependencyIndex(server, DependencyRelationship.CHILD)).toBeGreaterThan(-1);
    });
  });
});
