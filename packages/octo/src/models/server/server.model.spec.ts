import { Container } from '../../decorators/container.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';
import { App } from '../app/app.model.js';
import { Deployment } from '../deployment/deployment.model.js';
import { Environment } from '../environment/environment.model.js';
import { Execution } from '../execution/execution.model.js';
import { Region } from '../region/region.model.js';
import { Subnet } from '../subnet/subnet.model.js';
import { Server } from './server.model.js';

describe('Server UT', () => {
  let modelSerializationService: ModelSerializationService;

  beforeAll(async () => {
    modelSerializationService = await Container.get(ModelSerializationService);
  });

  describe('diff()', () => {
    describe('when diff of object with children', () => {
      it('should capture delete of children', async () => {
        // Create a new server, and an execution.
        const app = new App('test');
        const region = new Region('region');
        app.addRegion(region);
        const subnet = new Subnet(region, 'subnet');
        region.addSubnet(subnet);
        const environment = new Environment('qa');
        region.addEnvironment(environment);
        const server = new Server('backend');
        app.addServer(server);
        const deployment = new Deployment('0.0.1');
        server.addDeployment(deployment);
        const execution = new Execution(deployment, environment, subnet);

        // Commit state.
        const app_1 = (await modelSerializationService.deserialize(
          await modelSerializationService.serialize(app),
        )) as App;

        // Remove the server, and the execution.
        execution.remove();
        deployment.remove();
        server.remove();

        const diff = await app.diff(app_1);
        expect(diff).toMatchInlineSnapshot(`
          [
            {
              "action": "delete",
              "field": "executionId",
              "value": "backend-0.0.1-region-qa-subnet",
            },
            {
              "action": "delete",
              "field": "deploymentTag",
              "value": "0.0.1",
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
