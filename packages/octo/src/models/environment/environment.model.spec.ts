import { NodeType } from '../../app.type.js';
import { getSchemaInstance } from '../../functions/schema/schema.js';
import type { AModel } from '../model.abstract.js';
import { Environment } from './environment.model.js';
import { EnvironmentSchema } from './environment.schema.js';

describe('Environment UT', () => {
  it('should set static members', () => {
    const environment = new Environment('qa');

    expect((environment.constructor as typeof AModel).NODE_NAME).toBe('environment');
    expect((environment.constructor as typeof AModel).NODE_PACKAGE).toBe('@octo');
    expect((environment.constructor as typeof AModel).NODE_SCHEMA).toBe(EnvironmentSchema);
    expect((environment.constructor as typeof AModel).NODE_TYPE).toBe(NodeType.MODEL);
  });

  describe('schema validation', () => {
    it('should validate environmentName', async () => {
      const environment = new Environment('$$');

      expect(() => {
        getSchemaInstance<EnvironmentSchema>(EnvironmentSchema, environment.synth());
      }).toThrow('Validation error!');
    });

    it('should validate environmentVariables', async () => {
      const environment = new Environment('qa');
      environment.environmentVariables.set('$$', '$$');

      expect(() => {
        getSchemaInstance<EnvironmentSchema>(EnvironmentSchema, environment.synth());
      }).toThrow('Validation error!');
    });
  });
});
