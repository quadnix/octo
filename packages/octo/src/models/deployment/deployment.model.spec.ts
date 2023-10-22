import { App } from '../app/app.model';
import { Environment } from '../environment/environment.model';
import { Execution } from '../execution/execution.model';
import { Image } from '../image/image.model';
import { Region } from '../region/region.model';
import { Support } from '../support/support.model';
import { Deployment } from './deployment.model';

describe('Deployment UT', () => {
  describe('diff()', () => {
    describe('when diff of object with children', () => {
      it('should capture delete of children', async () => {
        const app = new App('test');
        const image = new Image('test', 'imageTag', {
          dockerFilePath: 'path/to/Dockerfile',
        });
        app.addImage(image);
        const region = new Region('region-1');
        app.addRegion(region);
        const environment = new Environment('qa');
        region.addEnvironment(environment);
        const support1 = new Support('nginx', 'nginx');
        const deployment = new Deployment('nginx@0.0.1', image);
        support1.addDeployment(deployment);
        new Execution(deployment, environment);
        const support2 = new Support('nginx', 'nginx');

        const diff = await support2.diff(support1);

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
          ]
        `);
      });
    });
  });
});