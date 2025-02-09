import { create } from '../../utilities/test-helpers/test-models.js';
import { NodeType } from '../../app.type.js';
import { getSchemaInstance } from '../../functions/schema/schema.js';
import type { AModel } from '../model.abstract.js';
import { ExecutionSchema } from './execution.schema.js';

describe('Execution UT', () => {
  it('should set static members', () => {
    const {
      execution: [execution],
    } = create({
      account: ['aws,account'],
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
    expect((execution.constructor as typeof AModel).NODE_SCHEMA).toBe(ExecutionSchema);
    expect((execution.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  it('should set executionId', () => {
    const {
      execution: [execution],
    } = create({
      account: ['aws,account'],
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

  describe('schema validation', () => {
    it('should validate environmentVariables', async () => {
      const {
        execution: [execution],
      } = create({
        account: ['aws,account'],
        app: ['test'],
        deployment: ['0.0.1'],
        environment: ['qa'],
        execution: [':0:0:0'],
        region: ['region'],
        server: ['backend'],
        subnet: ['subnet'],
      });
      execution.environmentVariables.set('$$', '$$');

      expect(() => {
        getSchemaInstance<ExecutionSchema>(ExecutionSchema, execution.synth());
      }).toThrow('Property "environmentVariables" in schema could not be validated!');
    });
  });
});
