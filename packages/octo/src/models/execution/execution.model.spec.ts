import { Container } from '../../decorators/container.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';
import { App } from '../app/app.model.js';
import { Deployment } from '../deployment/deployment.model.js';
import { Environment } from '../environment/environment.model.js';
import { Region } from '../region/region.model.js';
import { Server } from '../server/server.model.js';
import { Subnet } from '../subnet/subnet.model.js';
import { Execution } from './execution.model.js';

describe('Execution UT', () => {
  let modelSerializationService: ModelSerializationService;

  beforeAll(async () => {
    modelSerializationService = await Container.get(ModelSerializationService);
  });

  describe('diff()', () => {
    describe('when diff of object', () => {
      it('should capture delete', async () => {
        // Create a new execution.
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

        // Remove the execution.
        execution.remove();

        const diff = await app.diff(app_1);
        expect(diff).toMatchInlineSnapshot(`
          [
            {
              "action": "delete",
              "field": "executionId",
              "value": "backend-0.0.1-region-qa-subnet",
            },
          ]
        `);
      });
    });
  });
});
