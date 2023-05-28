import { App, AwsRegion, Environment, Server, Support } from '../../src/v0';

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
    const newAppRegion = newApp.regions.find(
      (r) => r.regionId === 'aws-us-east-1',
    );

    // Add a new staging environment.
    const stagingEnvironment = new Environment(newAppRegion, 'staging');
    stagingEnvironment.environmentVariables.set('env', 'staging');
    newAppRegion.addEnvironment(stagingEnvironment);

    // Update the qa environment.
    newAppRegion.environments
      .find((e) => e.environmentName === 'qa')
      .environmentVariables.set('env', 'qa');

    // Add new server and support.
    newApp.addServer(new Server(newApp, 'database'));
    newApp.addSupport(new Support(newApp, 'nginx'));

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
          "context": "app=test-app",
          "field": "server",
          "value": "database",
        },
        Diff {
          "action": "add",
          "context": "app=test-app",
          "field": "support",
          "value": "nginx",
        },
      ]
    `);
  });
});
