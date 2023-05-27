import { App, AwsRegion, Environment, Server, Support } from '../../src/v0';

describe('App E2E Test', () => {
  it('should generate app diff', () => {
    const app = new App('test-app');

    const region = new AwsRegion('aws-us-east-1');
    app.addRegion(region);

    const qaEnvironment = new Environment('qa');
    qaEnvironment.environmentVariables.set('env', 'QA');
    region.addEnvironment(qaEnvironment);

    app.addServer(new Server('backend'));

    const newApp = app.clone();

    // Add a new staging environment.
    const stagingEnvironment = new Environment('staging');
    stagingEnvironment.environmentVariables.set('env', 'staging');
    newApp.regions
      .find((r) => r.regionId === 'aws-us-east-1')
      .addEnvironment(stagingEnvironment);

    // Update the qa environment.
    newApp.regions
      .find((r) => r.regionId === 'aws-us-east-1')
      .environments.find((e) => e.environmentName === 'qa')
      .environmentVariables.set('env', 'qa');

    // Add new server and support.
    newApp.addServer(new Server('database'));
    newApp.addSupport(new Support('nginx'));

    expect(app.diff(newApp)).toMatchInlineSnapshot(`
      [
        Diff {
          "action": "update",
          "field": "environmentVariables",
          "value": {
            "key": "env",
            "value": "qa",
          },
        },
        Diff {
          "action": "add",
          "field": "environment",
          "value": "staging",
        },
        Diff {
          "action": "add",
          "field": "server",
          "value": "database",
        },
        Diff {
          "action": "add",
          "field": "support",
          "value": "nginx",
        },
      ]
    `);
  });
});
