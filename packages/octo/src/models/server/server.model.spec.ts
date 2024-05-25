import { Container } from '../../decorators/container.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';
import { App } from '../app/app.model.js';
import { Deployment } from '../deployment/deployment.model.js';
import { Environment } from '../environment/environment.model.js';
import { Execution } from '../execution/execution.model.js';
import { Region } from '../region/region.model.js';
import { Server } from './server.model.js';

describe('Server UT', () => {
  let modelSerializationService: ModelSerializationService;

  beforeAll(async () => {
    modelSerializationService = await Container.get(ModelSerializationService);
  });

  describe('diff()', () => {
    describe('when diff of object with children', () => {
      it('should capture delete of children', async () => {
        const app_0 = new App('test');
        const region_0 = new Region('region');
        app_0.addRegion(region_0);
        const environment_0 = new Environment('qa');
        region_0.addEnvironment(environment_0);
        const server_0 = new Server('backend');
        app_0.addServer(server_0);
        const deployment_0 = new Deployment('backend@0.0.1');
        server_0.addDeployment(deployment_0);
        new Execution(deployment_0, environment_0);

        const app_1 = (await modelSerializationService.deserialize(
          await modelSerializationService.serialize(app_0),
        )) as App;
        const region_1 = app_1.getChild('region', [{ key: 'regionId', value: 'region' }]) as Region;
        const environment_1 = region_1.getChild('environment', [
          { key: 'environmentName', value: 'qa' },
        ]) as Environment;
        const execution_1 = environment_1.getChild('execution', [
          { key: 'executionId', value: 'backend@0.0.1_qa' },
        ]) as Execution;
        const server_1 = app_1.getChild('server', [{ key: 'serverKey', value: 'backend' }]) as Server;
        const deployment_1 = server_1.getChild('deployment', [
          { key: 'deploymentTag', value: 'backend@0.0.1' },
        ]) as Deployment;

        execution_1.remove();
        deployment_1.remove();
        server_1.remove();
        const diff = await app_1.diff(app_0);

        expect(diff).toMatchInlineSnapshot(`
          [
            {
              "action": "delete",
              "field": "executionId",
              "value": "backend@0.0.1_qa",
            },
            {
              "action": "delete",
              "field": "deploymentTag",
              "value": "backend@0.0.1",
            },
            {
              "action": "delete",
              "field": "serverKey",
              "value": "backend",
            },
          ]
        `);
      });
    });
  });
});
