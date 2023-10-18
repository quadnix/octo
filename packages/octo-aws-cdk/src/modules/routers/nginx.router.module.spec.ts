import { App, Environment, Image, ModelSerializationService, Region } from '@quadnix/octo';
import { NginxRouterModule } from './nginx.router.module';

describe('NginxRouterModule UT', () => {
  it('should test add and delete operations', async () => {
    const nginxRouterModule = new NginxRouterModule();
    const service = new ModelSerializationService();

    const app1 = new App('test');
    const nginxImage1 = new Image('quadnix/nginx', '0.0.1', {
      dockerFilePath: 'resources/images/quadnix/nginx/0.0.1',
    });
    app1.addImage(nginxImage1);
    const region1 = new Region('region-1');
    app1.addRegion(region1);
    const environment1 = new Environment('qa');
    region1.addEnvironment(environment1);

    // Creating router on environment, should create nginx router 0.0.1
    nginxRouterModule.apply(app1, nginxImage1, environment1);

    const diffs1 = await app1.diff();
    expect(diffs1).toMatchSnapshot();
    expect(nginxRouterModule.synth()).toMatchSnapshot();

    const app2 = (await service.deserialize(service.serialize(app1))) as App;
    const nginxImage2 = new Image('quadnix/nginx', '0.0.2', {
      dockerFilePath: 'resources/images/quadnix/nginx/0.0.2',
    });
    app2.addImage(nginxImage2);
    const region2 = app2.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;
    const environment2 = region2.getChild('environment', [{ key: 'environmentName', value: 'qa' }]) as Environment;

    // Creating router on environment, should create another nginx router 0.0.2 in the same module.
    nginxRouterModule.apply(app2, nginxImage2, environment2);

    const diffs2 = await app2.diff(app1);
    expect(diffs2).toMatchSnapshot();
    expect(nginxRouterModule.synth()).toMatchSnapshot();

    const app3 = (await service.deserialize(service.serialize(app2))) as App;
    const nginxImage3 = app3.getChild('image', [{ key: 'imageTag', value: '0.0.1' }]) as Image;
    const region3 = app3.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;
    const environment3 = region3.getChild('environment', [{ key: 'environmentName', value: 'qa' }]) as Environment;

    // Removing router 0.0.1 on environment, should remove nginx router 0.0.1 from module.
    nginxRouterModule.remove(app3, nginxImage3, environment3);

    const diffs3 = await app3.diff(app2);
    expect(diffs3).toMatchSnapshot();
    expect(nginxRouterModule.synth()).toMatchSnapshot();
  });
});
