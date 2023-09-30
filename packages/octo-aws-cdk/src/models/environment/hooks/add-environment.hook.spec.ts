import { App, Environment, HookService, Image, ModelSerializationService, Region } from '@quadnix/octo';
import { AddEnvironmentHook } from './add-environment.hook';

describe('AddEnvironment Hook UT', () => {
  it('should add nginx execution on add environment', async () => {
    const app = new App('test');
    const environment = new Environment('qa');

    const nginxImage = new Image('nginx', '0.0.1', {
      dockerFilePath: 'resources/images/quadnix/nginx/0.0.1',
    });
    app.addImage(nginxImage);

    const hookService = HookService.getInstance();
    hookService.registerHooks([new AddEnvironmentHook([app, nginxImage, environment])]);

    const region = new Region('region-1');
    region.addEnvironment(environment);
    app.addRegion(region);

    const diffs = await app.diff();
    expect(diffs).toMatchInlineSnapshot(`
      [
        {
          "action": "add",
          "field": "imageId",
          "value": "nginx:0.0.1",
        },
        {
          "action": "add",
          "field": "serverKey",
          "value": "nginx",
        },
        {
          "action": "add",
          "field": "deploymentTag",
          "value": "0.0.1",
        },
        {
          "action": "add",
          "field": "executionId",
          "value": "0.0.1_qa",
        },
        {
          "action": "add",
          "field": "regionId",
          "value": "region-1",
        },
        {
          "action": "add",
          "field": "environmentName",
          "value": "qa",
        },
      ]
    `);
  });

  it('should be able to update nginx image', async () => {
    // Prepare an app state with a region and environment using nginx V1 execution.
    const app = new App('test');
    const environment = new Environment('qa');

    const nginxImageV1 = new Image('nginx', '0.0.1', {
      dockerFilePath: 'resources/images/quadnix/nginx/0.0.1',
    });
    app.addImage(nginxImageV1);

    const hookService = HookService.getInstance(true);
    hookService.registerHooks([new AddEnvironmentHook([app, nginxImageV1, environment])]);

    const region = new Region('region-1');
    region.addEnvironment(environment);
    app.addRegion(region);

    // Add new nginx V2 image.
    const modelSerializationService = new ModelSerializationService();
    const app1 = (await modelSerializationService.deserialize(modelSerializationService.serialize(app))) as App;
    const nginxImageV2 = new Image('nginx', '0.0.2', {
      dockerFilePath: 'resources/images/quadnix/nginx/0.0.2',
    });
    app1.addImage(nginxImageV2);

    // At present, we must invoke the hook manually.
    const addEnvironmentHook = new AddEnvironmentHook([app1, nginxImageV2, environment]);
    addEnvironmentHook.handle(app1, nginxImageV2, environment);

    const diffs = await app1.diff(app);

    expect(diffs).toMatchInlineSnapshot(`
      [
        {
          "action": "add",
          "field": "imageId",
          "value": "nginx:0.0.2",
        },
        {
          "action": "add",
          "field": "deploymentTag",
          "value": "0.0.2",
        },
        {
          "action": "add",
          "field": "executionId",
          "value": "0.0.2_qa",
        },
      ]
    `);
  });
});
