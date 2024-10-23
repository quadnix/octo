import { create } from '../../../test/helpers/test-models.js';
import { NodeType } from '../../app.type.js';
import type { Container } from '../../functions/container/container.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { ValidationService } from '../../services/validation/validation.service.js';
import type { AModel } from '../model.abstract.js';

describe('Execution UT', () => {
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
      execution: [execution],
    } = create({
      app: ['test'],
      deployment: ['0.0.1'],
      environment: ['qa'],
      execution: [':0:0:0'],
      region: ['region'],
      server: ['backend'],
      subnet: ['subnet'],
    });

    expect((execution.constructor as typeof AModel).NODE_NAME).toBe('execution');
    expect((execution.constructor as typeof AModel).NODE_PACKAGE).toBe('@octo');
    expect((execution.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  it('should set executionId', () => {
    const {
      execution: [execution],
    } = create({
      app: ['test'],
      deployment: ['0.0.1'],
      environment: ['qa'],
      execution: [':0:0:0'],
      region: ['region'],
      server: ['backend'],
      subnet: ['subnet'],
    });

    expect(execution.executionId).toBe('backend-0.0.1-region-qa-subnet');
  });

  describe('validation', () => {
    it('should validate environmentVariables', async () => {
      const {
        execution: [execution],
      } = create({
        app: ['test'],
        deployment: ['0.0.1'],
        environment: ['qa'],
        execution: [':0:0:0'],
        region: ['region'],
        server: ['backend'],
        subnet: ['subnet'],
      });
      execution.environmentVariables.set('$$', '$$');

      const validationService = await container.get(ValidationService);
      const result = validationService.validate();

      expect(result.pass).toBeFalsy();
    });
  });
});
