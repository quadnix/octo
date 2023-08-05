import { App, Deployment, Environment, Image, Region, SerializationService, Server, Support } from '../src';

describe('App E2E Test', () => {
  it('should generate app diff', async () => {
    const serializationService = new SerializationService();

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

  describe('Serialization', () => {
    it('should throw error when trying to add same child to two parent', async () => {
      const serializationService = new SerializationService();

      const app0 = new App('test-app');
      const region0_0 = new Region('region-1');
      const region0_1 = new Region('region-2');
      const environment0 = new Environment('qa');
      region0_0.addEnvironment(environment0);
      region0_1.addEnvironment(environment0);
      app0.addRegion(region0_0);
      app0.addRegion(region0_1);

      expect(() => serializationService.serialize(app0)).toThrowErrorMatchingInlineSnapshot(
        `"Found circular dependencies!"`,
      );
    });

    it('should serialize when multiple models have dependency on same model', async () => {
      const serializationService = new SerializationService();

      const app0 = new App('test-app');
      const image0 = new Image('backend-runner', '0.0.1', { dockerFilePath: 'path' });
      const server0 = new Server('backend');
      const deployment0 = new Deployment('0.0.1', image0);
      const deployment1 = new Deployment('0.0.2', image0);
      app0.addImage(image0);
      app0.addServer(server0);
      server0.addDeployment(deployment0);
      server0.addDeployment(deployment1);

      expect(serializationService.serialize(app0)).toMatchInlineSnapshot(`
      {
        "dependencies": [
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "name",
                "toField": "imageId",
              },
            ],
            "from": "app=test-app",
            "relationship": {
              "onField": "name",
              "toField": "imageId",
              "type": "parent",
            },
            "to": "image=backend-runner:0.0.1,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "imageId",
                "toField": "deploymentTag",
              },
            ],
            "from": "image=backend-runner:0.0.1,app=test-app",
            "relationship": undefined,
            "to": "deployment=0.0.1,server=backend,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "imageId",
                "toField": "deploymentTag",
              },
            ],
            "from": "image=backend-runner:0.0.1,app=test-app",
            "relationship": undefined,
            "to": "deployment=0.0.2,server=backend,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "imageId",
                "toField": "name",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "imageId",
                "toField": "name",
              },
            ],
            "from": "image=backend-runner:0.0.1,app=test-app",
            "relationship": {
              "onField": "imageId",
              "toField": "name",
              "type": "child",
            },
            "to": "app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "name",
                "toField": "serverKey",
              },
            ],
            "from": "app=test-app",
            "relationship": {
              "onField": "name",
              "toField": "serverKey",
              "type": "parent",
            },
            "to": "server=backend,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "serverKey",
                "toField": "name",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "serverKey",
                "toField": "name",
              },
            ],
            "from": "server=backend,app=test-app",
            "relationship": {
              "onField": "serverKey",
              "toField": "name",
              "type": "child",
            },
            "to": "app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "serverKey",
                "toField": "deploymentTag",
              },
            ],
            "from": "server=backend,app=test-app",
            "relationship": {
              "onField": "serverKey",
              "toField": "deploymentTag",
              "type": "parent",
            },
            "to": "deployment=0.0.1,server=backend,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "deploymentTag",
                "toField": "imageId",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "deploymentTag",
                "toField": "imageId",
              },
            ],
            "from": "deployment=0.0.1,server=backend,app=test-app",
            "relationship": undefined,
            "to": "image=backend-runner:0.0.1,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "deploymentTag",
                "toField": "serverKey",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "deploymentTag",
                "toField": "serverKey",
              },
            ],
            "from": "deployment=0.0.1,server=backend,app=test-app",
            "relationship": {
              "onField": "deploymentTag",
              "toField": "serverKey",
              "type": "child",
            },
            "to": "server=backend,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "delete",
                "onAction": "delete",
                "onField": "serverKey",
                "toField": "deploymentTag",
              },
            ],
            "from": "server=backend,app=test-app",
            "relationship": {
              "onField": "serverKey",
              "toField": "deploymentTag",
              "type": "parent",
            },
            "to": "deployment=0.0.2,server=backend,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "deploymentTag",
                "toField": "imageId",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "deploymentTag",
                "toField": "imageId",
              },
            ],
            "from": "deployment=0.0.2,server=backend,app=test-app",
            "relationship": undefined,
            "to": "image=backend-runner:0.0.1,app=test-app",
          },
          {
            "behaviors": [
              {
                "forAction": "add",
                "onAction": "add",
                "onField": "deploymentTag",
                "toField": "serverKey",
              },
              {
                "forAction": "update",
                "onAction": "add",
                "onField": "deploymentTag",
                "toField": "serverKey",
              },
            ],
            "from": "deployment=0.0.2,server=backend,app=test-app",
            "relationship": {
              "onField": "deploymentTag",
              "toField": "serverKey",
              "type": "child",
            },
            "to": "server=backend,app=test-app",
          },
        ],
        "models": {
          "app=test-app": {
            "className": "App",
            "model": {
              "name": "test-app",
            },
          },
          "deployment=0.0.1,server=backend,app=test-app": {
            "className": "Deployment",
            "model": {
              "deploymentTag": "0.0.1",
              "image": {
                "context": "image=backend-runner:0.0.1,app=test-app",
              },
            },
          },
          "deployment=0.0.2,server=backend,app=test-app": {
            "className": "Deployment",
            "model": {
              "deploymentTag": "0.0.2",
              "image": {
                "context": "image=backend-runner:0.0.1,app=test-app",
              },
            },
          },
          "image=backend-runner:0.0.1,app=test-app": {
            "className": "Image",
            "model": {
              "dockerOptions": {
                "buildArgs": {},
                "dockerFilePath": "/Users/rash/Workspace/@quadnix/octo/packages/octo/path",
                "quiet": undefined,
              },
              "imageId": "0.0.1",
              "imageName": "backend-runner",
              "imageTag": "0.0.1",
            },
          },
          "server=backend,app=test-app": {
            "className": "Server",
            "model": {
              "serverKey": "backend",
            },
          },
        },
        "version": "v0",
      }
    `);
    });
  });
});
