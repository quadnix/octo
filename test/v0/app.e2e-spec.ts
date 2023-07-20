import { App, Deployment, Environment, Image, Region, SerializationService, Server, Support } from '../../src/v0';

describe('App E2E Test', () => {
  it('should generate app diff', async () => {
    const serializationService = new SerializationService();

    const oldApp = new App('test-app');

    const image = new Image('image', 'tag', { dockerFilePath: '.' });
    oldApp.addImage(image);

    const oldRegion = new Region('region-1');
    oldApp.addRegion(oldRegion);

    const qaEnvironment = new Environment('qa');
    qaEnvironment.environmentVariables.set('env', 'QA');
    oldRegion.addEnvironment(qaEnvironment);

    oldApp.addServer(new Server('backend'));

    const newApp = (await serializationService.deserialize(serializationService.serialize(oldApp))) as App;
    const newAppRegion: Region = newApp
      .getChildren('region')
      ['region'].find((d) => (d.to as Region).regionId === 'region-1')!.to as Region;
    const newAppBackendServer: Server = newApp
      .getChildren('server')
      ['server'].find((d) => (d.to as Server).serverKey === 'backend')!.to as Server;
    const newAppQaEnvironment: Environment = newAppRegion
      .getChildren('environment')
      ['environment'].find((d) => (d.to as Environment).environmentName === 'qa')!.to as Environment;

    // Add a deployment to backend server.
    newAppBackendServer.addDeployment(new Deployment('v0.0.1', image));

    // Add a new staging environment.
    const stagingEnvironment = new Environment('staging');
    stagingEnvironment.environmentVariables.set('env', 'staging');
    newAppRegion.addEnvironment(stagingEnvironment);

    // Update the qa environment.
    newAppQaEnvironment.environmentVariables.set('env', 'qa');

    // Add new server.
    const databaseServer = new Server('database');
    databaseServer.addDeployment(new Deployment('v0.0.1', image));
    newApp.addServer(databaseServer);

    // Add new support.
    const nginxSupport = new Support('nginx', 'nginx');
    nginxSupport.addDeployment(new Deployment('v1', image));
    newApp.addSupport(nginxSupport);

    expect(newApp.diff(oldApp)).toMatchInlineSnapshot(`
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
