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
        const app_0 = new App('test');
        const region_0 = new Region('region');
        app_0.addRegion(region_0);
        const subnet_0 = new Subnet(region_0, 'subnet');
        region_0.addSubnet(subnet_0);
        const environment_0 = new Environment('qa');
        region_0.addEnvironment(environment_0);
        const server_0 = new Server('backend');
        app_0.addServer(server_0);
        const deployment_0 = new Deployment('backend@0.0.1');
        server_0.addDeployment(deployment_0);
        new Execution(deployment_0, environment_0, subnet_0);

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

        execution_1.remove();
        const diff = await app_1.diff(app_0);

        expect(diff).toMatchInlineSnapshot(`
          [
            {
              "action": "delete",
              "field": "executionId",
              "value": "backend@0.0.1_qa",
            },
          ]
        `);
      });
    });
  });
});
