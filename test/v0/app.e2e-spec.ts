import { App, AwsRegion, Deployment, Environment, Server, Support } from '../../src/v0';

describe('App E2E Test', () => {
  it('should generate app diff', () => {
    const app = new App('test-app');

    const region = new AwsRegion(app, 'aws-us-east-1');
    app.addRegion(region);

    const qaEnvironment = new Environment(region, 'qa');
    qaEnvironment.environmentVariables.set('env', 'QA');
    region.addEnvironment(qaEnvironment);

    app.addServer(new Server(app, 'backend'));

    const newApp = app.clone();
    const newAppRegion = newApp.regions.find((r) => r.regionId === 'aws-us-east-1');
    const newAppBackendServer = newApp.servers.find((s) => s.serverKey === 'backend');

    // Add a deployment to backend server.
    newAppBackendServer.addDeployment(new Deployment(newAppBackendServer, 'v0.0.1'));

    // Add a new staging environment.
    const stagingEnvironment = new Environment(newAppRegion, 'staging');
    stagingEnvironment.environmentVariables.set('env', 'staging');
    newAppRegion.addEnvironment(stagingEnvironment);

    // Update the qa environment.
    newAppRegion.environments.find((e) => e.environmentName === 'qa').environmentVariables.set('env', 'qa');

    // Add new server.
    const newAppDatabaseServer = new Server(newApp, 'database');
    newAppDatabaseServer.addDeployment(new Deployment(newAppDatabaseServer, 'v0.0.1'));
    newApp.addServer(newAppDatabaseServer);

    // Add new support.
    const newAppNginxSupport = new Support(newApp, 'nginx');
    newAppNginxSupport.addDeployment(new Deployment(newAppNginxSupport, 'v1'));
    newApp.addSupport(newAppNginxSupport);

    expect(app.diff(newApp)).toMatchInlineSnapshot(`
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
