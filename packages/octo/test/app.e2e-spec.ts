import { App, Deployment, Environment, Image, ModelSerializationService, Region, Server, Support } from '../src';

describe('App E2E Test', () => {
  it('should generate app diff', async () => {
    const serializationService = new ModelSerializationService();

    const app0 = new App('test-app');
    const image0 = new Image('image', 'tag', { dockerFilePath: '.' });
    app0.addImage(image0);
    const region0 = new Region('region-1');
    app0.addRegion(region0);
    const qaEnvironment0 = new Environment('qa');
    qaEnvironment0.environmentVariables.set('env', 'QA');
    region0.addEnvironment(qaEnvironment0);
    app0.addServer(new Server('backend'));

    const app1 = (await serializationService.deserialize(serializationService.serialize(app0))) as App;
    const region1 = app1.getChild('region', [{ key: 'regionId', value: 'region-1' }]) as Region;
    const backendServer1 = app1.getChild('server', [{ key: 'serverKey', value: 'backend' }]) as Server;
    const qaEnvironment1 = region1.getChild('environment', [{ key: 'environmentName', value: 'qa' }]) as Environment;
    // Add a deployment to backend server.
    backendServer1.addDeployment(new Deployment('v0.0.1', image0));
    // Add a new staging environment.
    const stagingEnvironment1 = new Environment('staging');
    stagingEnvironment1.environmentVariables.set('env', 'staging');
    region1.addEnvironment(stagingEnvironment1);
    // Update the qa environment.
    qaEnvironment1.environmentVariables.set('env', 'qa');
    // Add new server.
    const databaseServer1 = new Server('database');
    databaseServer1.addDeployment(new Deployment('v0.0.1', image0));
    app1.addServer(databaseServer1);
    // Add new support.
    const nginxSupport1 = new Support('nginx', 'nginx');
    nginxSupport1.addDeployment(new Deployment('v1', image0));
    app1.addSupport(nginxSupport1);

    const diffs = await app1.diff(app0);
    expect(diffs).toMatchInlineSnapshot(`
      [
        {
          "action": "update",
          "field": "environmentVariables",
          "value": {
            "key": "env",
            "value": "qa",
          },
        },
        {
          "action": "add",
          "field": "environmentName",
          "value": "staging",
        },
        {
          "action": "add",
          "field": "environmentVariables",
          "value": {
            "key": "env",
            "value": "staging",
          },
        },
        {
          "action": "add",
          "field": "deploymentTag",
          "value": "v0.0.1",
        },
        {
          "action": "add",
          "field": "serverKey",
          "value": "database",
        },
        {
          "action": "add",
          "field": "deploymentTag",
          "value": "v0.0.1",
        },
        {
          "action": "add",
          "field": "serverKey",
          "value": "nginx",
        },
        {
          "action": "add",
          "field": "deploymentTag",
          "value": "v1",
        },
      ]
    `);
  });
});
