import { App, Environment, HookService, Image, Region } from '@quadnix/octo';
import { AddEnvironmentHook } from './add-environment.hook';

describe('AddEnvironment Hook UT', () => {
  it('should add nginx execution on add environment', () => {
    const app = new App('test');
    const newEnvironment = new Environment('qa');

    const nginxImage = new Image('nginx', '0.0.1', {
      dockerFilePath: 'resources/images/quadnix/nginx/0.0.1',
    });
    app.addImage(nginxImage);

    const hookService = HookService.getInstance();
    hookService.registerHooks([new AddEnvironmentHook([app, nginxImage, newEnvironment])]);

    const region = new Region('region-1');
    region.addEnvironment(newEnvironment);
    app.addRegion(region);

    const diffs = app.diff();
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

  it('should be able to update nginx image', () => {
    const oldApp = new App('test');
    const oldEnvironment = new Environment('qa');

    const oldNginxImage = new Image('nginx', '0.0.1', {
      dockerFilePath: 'resources/images/quadnix/nginx/0.0.1',
    });
    oldApp.addImage(oldNginxImage);

    const oldHookService = HookService.getInstance(true);
    oldHookService.registerHooks([new AddEnvironmentHook([oldApp, oldNginxImage, oldEnvironment])]);

    const oldRegion = new Region('region-1');
    oldRegion.addEnvironment(oldEnvironment);
    oldApp.addRegion(oldRegion);

    // Do the exact same thing as above, but also add the update.
    const newApp = new App('test');
    const newEnvironment = new Environment('qa');

    const newNginxImage = new Image('nginx', '0.0.2', {
      dockerFilePath: 'resources/images/quadnix/nginx/0.0.2',
    });
    newApp.addImage(oldNginxImage);
    newApp.addImage(newNginxImage);

    const newHookService = HookService.getInstance(true);
    newHookService.registerHooks([new AddEnvironmentHook([newApp, oldNginxImage, newEnvironment])]);
    newHookService.registerHooks([new AddEnvironmentHook([newApp, newNginxImage, newEnvironment])]);

    const newRegion = new Region('region-1');
    newRegion.addEnvironment(newEnvironment);
    newApp.addRegion(newRegion);

    const diffs = newApp.diff(oldApp);

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
