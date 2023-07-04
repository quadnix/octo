import { App, Deployment, Environment, Region, Server, Support } from '../../src/v0';

describe('App E2E Test', () => {
  it('should generate app diff', () => {
    const oldApp = new App('test-app');

    const oldRegion = new Region('region-1');
    oldApp.addRegion(oldRegion);

    const qaEnvironment = new Environment('qa');
    qaEnvironment.environmentVariables.set('env', 'QA');
    oldRegion.addEnvironment(qaEnvironment);

    oldApp.addServer(new Server('backend'));

    const newApp = oldApp.clone();
    const newAppRegion: Region = newApp.regions.find((r) => r.regionId === 'region-1') as Region;
    const backendServer: Server = newApp.servers.find((s) => s.serverKey === 'backend') as Server;

    // Add a deployment to backend server.
    backendServer.addDeployment(new Deployment('v0.0.1'));

    // Add a new staging environment.
    const stagingEnvironment = new Environment('staging');
    stagingEnvironment.environmentVariables.set('env', 'staging');
    newAppRegion.addEnvironment(stagingEnvironment);

    // Update the qa environment.
    newAppRegion.environments.find((e) => e.environmentName === 'qa')!.environmentVariables.set('env', 'qa');

    // Add new server.
    const databaseServer = new Server('database');
    databaseServer.addDeployment(new Deployment('v0.0.1'));
    newApp.addServer(databaseServer);

    // Add new support.
    const nginxSupport = new Support('nginx');
    nginxSupport.addDeployment(new Deployment('v1'));
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
