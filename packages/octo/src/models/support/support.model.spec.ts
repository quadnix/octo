import { Container } from '../../decorators/container.js';
import { ModelSerializationService } from '../../services/serialization/model/model-serialization.service.js';
import { App } from '../app/app.model.js';
import { Deployment } from '../deployment/deployment.model.js';
import { Environment } from '../environment/environment.model.js';
import { Execution } from '../execution/execution.model.js';
import { Image } from '../image/image.model.js';
import { Region } from '../region/region.model.js';
import { Support } from './support.model.js';

describe('Support UT', () => {
  let modelSerializationService: ModelSerializationService;

  beforeAll(async () => {
    modelSerializationService = await Container.get(ModelSerializationService);
  });

  describe('diff()', () => {
    describe('when diff of object with children', () => {
      it('should capture delete of children', async () => {
        const app0_0 = new App('test');
        const image0_0 = new Image('test', 'imageTag', {
          dockerfilePath: 'path/to/Dockerfile',
        });
        app0_0.addImage(image0_0);
        const region0_0 = new Region('region');
        app0_0.addRegion(region0_0);
        const environment0_0 = new Environment('qa');
        region0_0.addEnvironment(environment0_0);
        const support0_0 = new Support('nginx', 'nginx');
        app0_0.addSupport(support0_0);
        const deployment0_0 = new Deployment('nginx@0.0.1');
        support0_0.addDeployment(deployment0_0);
        new Execution(deployment0_0, environment0_0, image0_0);

        const app0_1 = (await modelSerializationService.deserialize(
          modelSerializationService.serialize(app0_0),
        )) as App;
        const region0_1 = app0_1.getChild('region', [{ key: 'regionId', value: 'region' }]) as Region;
        const environment0_1 = region0_1.getChild('environment', [
          { key: 'environmentName', value: 'qa' },
        ]) as Environment;
        const execution0_1 = environment0_1.getChild('execution', [
          { key: 'executionId', value: 'nginx@0.0.1_qa' },
        ]) as Execution;
        const support0_1 = app0_1.getChild('support', [{ key: 'serverKey', value: 'nginx' }]) as Support;
        const deployment0_1 = support0_1.getChild('deployment', [
          { key: 'deploymentTag', value: 'nginx@0.0.1' },
        ]) as Deployment;

        execution0_1.remove(true);
        deployment0_1.remove();
        support0_1.remove();
        const diff = await app0_1.diff(app0_0);

        expect(diff).toMatchInlineSnapshot(`
          [
            {
              "action": "delete",
              "field": "executionId",
              "value": "nginx@0.0.1_qa",
            },
            {
              "action": "delete",
              "field": "deploymentTag",
              "value": "nginx@0.0.1",
            },
            {
              "action": "delete",
              "field": "serverKey",
              "value": "nginx",
            },
          ]
        `);
      });
    });
  });
});
