import { create } from '../../../test/helpers/test-models.js';
import { NodeType } from '../../app.type.js';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { DependencyRelationship } from '../../functions/dependency/dependency.js';
import { ValidationService } from '../../services/validation/validation.service.js';
import type { AModel } from '../model.abstract.js';
import { Server } from './server.model.js';

describe('Server UT', () => {
  let container: Container;

  beforeEach(async () => {
    container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });
  });

  afterEach(async () => {
    await TestContainer.reset();
  });

  it('should set static members', () => {
    const server = new Server('backend');

    expect((server.constructor as typeof AModel).NODE_NAME).toBe('server');
    expect((server.constructor as typeof AModel).NODE_PACKAGE).toBe('@octo');
    expect((server.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  describe('validation', () => {
    it('should validate serverKey', async () => {
      new Server('$$');

      const validationService = await container.get(ValidationService);
      const result = validationService.validate();

      expect(result.pass).toBeFalsy();
    });
  });

  describe('addDeployment()', () => {
    it('should throw error if duplicate deployment exist', () => {
      expect(() => {
        create({ app: ['test'], deployment: ['0.0.1', '0.0.1:-1'], server: ['backend'] });
      }).toThrow('Deployment already exists!');
    });

    it('should add deployment as a child', () => {
      const {
        deployment: [deployment],
        server: [server],
      } = create({ app: ['test'], deployment: ['0.0.1'], server: ['backend'] });

      expect(server.getDependencyIndex(deployment, DependencyRelationship.PARENT)).toBeGreaterThan(-1);
      expect(deployment.getDependencyIndex(server, DependencyRelationship.CHILD)).toBeGreaterThan(-1);
    });
  });
});
