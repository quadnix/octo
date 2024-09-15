import { NodeType } from '../../app.type.js';
import { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { ValidationService } from '../../services/validation/validation.service.js';
import type { AModel } from '../model.abstract.js';
import { Environment } from './environment.model.js';

describe('Environment UT', () => {
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
    const environment = new Environment('qa');

    expect((environment.constructor as typeof AModel).NODE_NAME).toBe('environment');
    expect((environment.constructor as typeof AModel).NODE_PACKAGE).toBe('@octo');
    expect((environment.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  describe('validation', () => {
    it('should validate environmentName', async () => {
      new Environment('$$');

      const validationService = await Container.get(ValidationService);
      const result = validationService.validate();

      expect(result.pass).toBeFalsy();
    });

    it('should validate environmentVariables', async () => {
      const environment = new Environment('qa');
      environment.environmentVariables.set('$$', '$$');

      const validationService = await Container.get(ValidationService);
      const result = validationService.validate();

      expect(result.pass).toBeFalsy();
    });
  });
});
