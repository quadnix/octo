import { App, AwsRegion, Deployment, Environment, Region, Server, Support } from '../../src/v0';

describe('App E2E Test', () => {
  it('should generate app diff', () => {
    const oldApp = new App('test-app');

    const oldRegion = new AwsRegion(oldApp, 'aws-us-east-1');
    oldApp.addRegion(oldRegion);

    const qaEnvironment = new Environment(oldRegion, 'qa');
    qaEnvironment.environmentVariables.set('env', 'QA');
    oldRegion.addEnvironment(qaEnvironment);

    oldApp.addServer(new Server(oldApp, 'backend'));

    const newApp = oldApp.clone();
    const newAppRegion: Region = newApp.regions.find((r) => r.regionId === 'aws-us-east-1') as Region;
    const backendServer: Server = newApp.servers.find((s) => s.serverKey === 'backend') as Server;

    // Add a deployment to backend server.
    backendServer.addDeployment(new Deployment(backendServer, 'v0.0.1'));

    // Add a new staging environment.
    const stagingEnvironment = new Environment(newAppRegion, 'staging');
    stagingEnvironment.environmentVariables.set('env', 'staging');
    newAppRegion.addEnvironment(stagingEnvironment);

    // Update the qa environment.
    newAppRegion.environments.find((e) => e.environmentName === 'qa')!.environmentVariables.set('env', 'qa');

    // Add new server.
    const databaseServer = new Server(newApp, 'database');
    databaseServer.addDeployment(new Deployment(databaseServer, 'v0.0.1'));
    newApp.addServer(databaseServer);

    // Add new support.
    const nginxSupport = new Support(newApp, 'nginx');
    nginxSupport.addDeployment(new Deployment(nginxSupport, 'v1'));
    newApp.addSupport(nginxSupport);

    expect(newApp.diff(oldApp)).toMatchInlineSnapshot(`
      [
        Diff {
          "action": "update",
          "context": "environment=qa,region=aws-us-east-1,app=test-app",
          "field": "environmentVariables",
          "value": {
            "key": "env",
            "value": "qa",
          },
        },
        Diff {
          "action": "add",
          "context": "region=aws-us-east-1,app=test-app",
          "field": "environment",
          "value": "staging",
        },
        Diff {
          "action": "add",
          "context": "environment=staging,region=aws-us-east-1,app=test-app",
          "field": "environmentVariables",
          "value": {
            "key": "env",
            "value": "staging",
          },
        },
        Diff {
          "action": "add",
          "context": "server=backend,app=test-app",
          "field": "deployment",
          "value": "v0.0.1",
        },
        Diff {
          "action": "add",
          "context": "app=test-app",
          "field": "server",
          "value": "database",
        },
        Diff {
          "action": "add",
          "context": "server=database,app=test-app",
          "field": "deployment",
          "value": "v0.0.1",
        },
        Diff {
          "action": "add",
          "context": "app=test-app",
          "field": "support",
          "value": "nginx",
        },
        Diff {
          "action": "add",
          "context": "support=nginx,app=test-app",
          "field": "deployment",
          "value": "v1",
        },
      ]
    `);
  });
});
